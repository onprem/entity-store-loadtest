import { sleep } from 'k6';
import usclient from './client.js';
import {getKey, newEntity, isLucky, populateConfigInfo} from './helpers.js';
import config from './config.js';

export const options = {
  scenarios: {
    // Creates entities with randomised GVK, namespace, and name
    create: {
      exec: 'create',
      executor: 'ramping-arrival-rate',
      stages: [
        { target: config.us.createRPS, duration: '40s' },
        { target: config.us.createRPS, duration: `${config.test.durationMins-1}m` },
        { target: 0, duration: '20s' },
      ],
      preAllocatedVUs: config.us.maxApps,
      maxVUs: config.us.maxApps * 10,
    },
    // TODO(onprem): Enable this scenario again once Watch starts working.
    // https://github.com/grafana/search-and-storage-team/issues/28
    // listWatch: {
    //   exec: 'listWatch',
    //   vus: config.us.maxApps,
    //   iterations: 1,
    //   executor: 'per-vu-iterations',
    //   maxDuration: `${config.test.durationMins*60+30}s`
    // },
    list: {
      exec: 'list',
      executor: 'constant-arrival-rate',
      duration: `${config.test.durationMins}m`,
      rate: config.us.maxApps*2,
      timeUnit: `${Math.min(config.test.durationMins, 10)}m`,
      preAllocatedVUs: 2,
      maxVUs: config.us.maxApps,
    }
  },
  tags: {
    testid: config.test.testID,
  },
  cloud: {
    // Project: Unified Storage Loadtest
    projectID: config.cloud.projectID,
    // Test runs with the same name groups test runs together.
    name: `${config.cloud.name}`,
  },
}

export function create() {
  const entity = newEntity();
  const _resp = usclient.create(entity)
};

export async function listWatch() {
  // wait randomly for starting, for a maximum of 30s.
  sleep(10 + Math.random()*20)

  const key = getKey().allObjects;

  const result = usclient.list(key, 500)

  console.log("list: finished for app, key=", key, "count=", result.entities.length, "RV=", result.resourceVersion)

  const watchFor = Math.ceil(config.test.durationMins * 60) + 30

  const onCreate = (event) => {
    if (isLucky(config.us.chanceUpdate)) {
      const readResp = usclient.read(event.entity.key)

      var e = readResp.message;
      e.labels["k6.io/updated"] = "true"

      const updResp = usclient.update(e);

      console.debug("watch: entity updated! key: ", updResp.message.entity.key)
    } else if (isLucky(config.us.chanceDelete)) {
      const resp = usclient.del(event.entity.key);

      console.debug("watch: entity deleted! key: ", resp.message.entity.key)
    }
  }

  await usclient.watch(key, result.resourceVersion, onCreate, null, null, watchFor);
}

export async function list() {
  const key = getKey().allObjects;

  const result = usclient.list(key, 3000)

  console.log("list: finished for app, key=", key, "count=", result.entities.length, "RV=", result.resourceVersion)
}

export function setup() {
  populateConfigInfo(config)
}
