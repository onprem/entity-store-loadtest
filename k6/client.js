import grpc from 'k6/net/grpc';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';


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
  client.connect('localhost:10000', {
    plaintext: true,
    timeout: 30
  });

  const response = client.invoke(`entity.EntityStore/${method}`, data, grpcParams);

  const tags = {method: method, status: `${response.status}`}
  if (response.message.status) tags['respstatus'] = response.message.status

  grpcRequestsCounter.add(1, tags)
 
  check(response, {
    'grpc status is OK': (r) => r && r.status === grpc.StatusOK,
  });

  client.close();

  return response
};

function create(entity) {
  const resp = request('Create', {entity: entity})

  check(resp, {
    'create status is OK': (r) => r && r.message.status === 'CREATED',
  });

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

function list(key) {
  let results = []

  let nextPage = ""
  let error = false
  let hasMore = true

  let i = 0
  while (hasMore) {
    const data = {
      key: [key],
      withBody: true,
      withStatus: true,
      limit: 500,
      nextPageToken: nextPage,
    }

    const response = request('List', data);

    if (response.status !== grpc.StatusOK) {
      error = true
      hasMore = false
      continue
    }

    var msg = response.message
    results.push(...msg.results)
    msg.results = [];

    nextPage = msg.nextPageToken;
    if (!nextPage) {
      hasMore = false
    }

    console.debug("list(",i,"): successful: listed entities: ", response.message.results.length,
      "; key: ", key,
      "; continue: ", nextPage,
      "; hasMore: ", hasMore)
    i++;
  }

  check(error, {
    'list status is OK': (e) => e === false,
  });

  return results;
};

function getEventOriginTS(event) {
  if (event.entity.updatedAt > 1000) {
    return event.entity.updatedAt
  }

  return event.entity.createdAt
}

function watch(key, onCreate, onUpdate, onDelete, endAfter) {
  client.connect('localhost:10000', {
    plaintext: true,
    timeout: 10
  });

  const stream = new grpc.Stream(client, 'entity.EntityStore/Watch', grpcParams);

  stream.on('data', function (event) {
    if (!event.entity) {
      console.error('event is missing entity:', event)
      return
    }

    const tags = {action: event.entity.action};
    watchCounter.add(1, tags)
    watchEventLatency.add(Date.now() - getEventOriginTS(event), tags)

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
    console.debug(
      'watch event: type "' +
        event.entity.action +
        '" key "' +
        event.entity.key
    );
  });

  stream.on('end', function () {
    // The server has finished sending
    client.close();
    console.log('watch all done');
    console.log("watch event key: ", key, "count: ", count)
  });

  stream.on('error', function (e) {
    // An error has occurred and the stream has been closed.
    check(error, {
      'watch stream is OK': (e) => !e,
    });
    console.error('watch error: key: ', key, "err: " + JSON.stringify(e));
  });

  console.log("starting watch for key: ", key)

  stream.write({
    key: [key],
    withBody: true,
    withStatus: true,
  });

  sleep(endAfter)
  stream.end()
}

export default {
  create,
  update,
  del,
  read,
  list,
  watch
};
