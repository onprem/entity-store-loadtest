import grpc from 'k6/net/grpc';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { setTimeout } from "k6/timers";

import config from './config.js';

const listCounter = new Counter('list_entities')
const watchCounter = new Counter('watch_events_recieved')
const grpcRequestsCounter = new Counter('grpc_requests')
const watchEventLatency = new Trend('watch_event_latency')

const client = new grpc.Client();
client.load(['definitions'], 'entity.proto');

const grpcParams = {
  metadata: {
    "grafana-login": "admin",
    "grafana-userid": "1",
    "grafana-orgid": "1"
  },
}

function request(method, data) {
  let response
  try {
    client.connect(config.us.address, { plaintext: true, timeout: '10s', maxReceiveSize: 5e8 });
    response = client.invoke(`entity.EntityStore/${method}`, data, grpcParams);
  } catch(error) {
    console.error('request error:', error, 'response:', response)
  }

  check(response, {
    'grpc status is OK': (r) => r && r.status === grpc.StatusOK,
  });

  let tags = {method: method}
  if (response) {
    if (response.message && response.message.status) tags['respstatus'] = response.message.status
    if (response.status) tags['status'] = `${response.status}`
  }

  grpcRequestsCounter.add(1, tags)

  client.close();

  return response
};

function create(entity) {
  const resp = request('Create', {entity: entity})

  check(resp, {
    'create status is OK': (r) => r && r.message && r.message.status === 'CREATED',
  });

  // console.debug('created entity, key=', entity.key)

  return resp
}

function read(key) {
  const data = {
    key: key,
    withBody: true,
    withStatus: true,
  }

  const resp = request('Read', data);

  check(resp, {
    'no errors in entity': (r) => r && (!r.message.errors || r.message.errors.length === 0),
  })

  if (resp.message.errors && resp.message.errors.length>0) {
    console.log('read: errors present in entity:', resp.message.errors.join('; '))
  }

  return resp
}

function update(entity) {
  const resp = request('Update', {entity: entity});

  check(resp, {
    'update status is OK': (r) => r.message && r.message.status === "UPDATED",
  })

  return resp
}

function del(key) {
  const resp = request('Delete', {key: key});

  check(resp, {
    'delete status is OK': (r) => r.message && r.message.status === "DELETED",
  })

  return resp
}

function list(key, limit) {
  let results = []

  let nextPage = ""
  let error = false
  let hasMore = true
  let resourceVersion = -1

  let i = 0
  while (hasMore) {
    const data = {
      key: [key],
      withBody: true,
      withStatus: true,
      limit: limit,
      nextPageToken: nextPage,
    }

    const response = request('List', data);

    if (!response || response.status !== grpc.StatusOK) {
      console.error("list: error; response=", response)
      error = true
      hasMore = false
      break;
    }

    let msg = response.message
    results.push(...msg.results)

    nextPage = msg.nextPageToken;
    resourceVersion = msg.resourceVersion
    if (nextPage === "") {
      hasMore = false
    }

    listCounter.add(msg.results.length)

    console.log("list(",i,"): successful: listed entities: ", response.message.results.length,
      "; key: ", key,
      "; continue: ", nextPage,
      "; hasMore: ", hasMore,
      "; RV: ", response.message.resourceVersion,
    )

    msg.results = [];
    i++;
  }

  check(error, {
    'list status is OK': (e) => e === false,
  });

  return {
    resourceVersion,
    entities: results,
  };
};

function getEventOriginTS(event) {
  if (event.entity.updatedAt > 1000) {
    return event.entity.updatedAt
  }

  return event.entity.createdAt
}

function watch(key, sinceRV, onCreate, onUpdate, onDelete, endAfter) {
  const watchStartTS = Date.now();

  try {
    client.connect(config.us.address, {
      plaintext: true,
      timeout: '10s',
      maxReceiveSize: 5e8
    });
  } catch(error) {
    console.error('watch: failed to connect', 'err', error)
  }

  return new Promise((resolve, reject) => {
    const stream = new grpc.Stream(client, 'entity.EntityStore/Watch', grpcParams);

    stream.on('data', function (event) {
      if (!event.entity) {
        console.error('event is missing entity:', event)
        return
      }

      const tags = {action: event.entity.action};
      watchCounter.add(1, tags)
      watchEventLatency.add(
        // Adjust the latency values for events that originated before the Watch
        // even started.
        Date.now() - Math.max(watchStartTS, getEventOriginTS(event)),
        // Date.now() - event.timestamp,
        tags,
      )

      switch (event.entity.action) {
        case 'CREATED':
          if (onCreate) onCreate(event);
          break;
        case 'DELETED':
          if (onDelete) onDelete(event);
          break;
        case 'UPDATED':
          if (onUpdate) onUpdate(event);
          break;
        default:
          console.error("watch: recieved event with unknown action:", event.entity.action)
          break;
      }
      // console.debug(
      //   'watch event: type "' +
      //     event.entity.action +
      //     '" key "' +
      //     event.entity.key
      // );
    });

    stream.on('end', function () {
      // The server has finished sending
      client.close();
      console.log('watch all done,', 'key: ', key)
      resolve()
    });

    stream.on('error', function (e) {
      // An error has occurred and the stream has been closed.
      check(e, {
        'watch stream is OK': (e) => !e,
      });
      console.error('watch error: key: ', key, "err: " + JSON.stringify(e));
      reject(e)
    });

    console.log("watch: started watch for key: ", key)

    stream.write({
      action: 'START',
      key: [key],
      since: sinceRV,
      withBody: true,
      withStatus: true,
    });

    setTimeout(()=>{
      stream.write({
        action: 'STOP',
      });

      console.log('watch: sleep endeded, closing stream')
      stream.end()
    }, endAfter*1000)
  });
}

export default {
  create,
  update,
  del,
  read,
  list,
  watch
};
