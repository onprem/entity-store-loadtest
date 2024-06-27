import encoding from 'k6/encoding';
import exec from 'k6/execution';
import { crypto } from 'k6/experimental/webcrypto';
import { Gauge } from 'k6/metrics';

import config from './config.js';

const configInfo = new Gauge('test_config_info')

export const getKey = () => {
  const appID = exec.scenario.iterationInTest % config.us.maxApps;
  const eID = exec.scenario.iterationInTest;
  const testID = config.test.testID;

  const key = {
    namespace: `stack-${eID % config.us.maxStacks}`,
    group: `${appID}.${testID}.grafana.com`,
    groupVersion: `v0alpha${appID % 3}`,
    resource: `someres-${appID}`,
    name: `sample-${testID}-${appID}-${eID}`,
    string: ``,
    allObjectsScoped: ``,
    allObjects: ``,
  };

  // /<group>/<resource>[/namespaces/<namespace>][/<name>[/<subresource>]]
  key.string = `/${key.group}/${key.resource}/namespaces/${key.namespace}/${key.name}`;

  // /<group>/<resource>[/namespaces/<namespace>]
  key.allObjectsScoped = key.string.replace(/\/sample-[\w\d]+-\d+-\d+/, '');
  // /<group>/<resource>
  key.allObjects = key.allObjectsScoped.replace(/\/namespaces\/stack-\d+/, '')

  return key;
}

export const newEntity = () => {
  const k = getKey()

  const labels = {"grafana.app/name": k.name}
  const title = "The " + k.name
  const metadata = {name: k.name, labels: k.labels}

  // Unit32 is 4 bytes. $ bytes * 256 = 1024 bytes or 1 KiB
  const bodyArray = new Uint32Array(config.us.entitySizeKiB * 256);
  crypto.getRandomValues(bodyArray);

  const body = {metadata: metadata, spec: {title: title, random: bodyArray}}

  return {
    key: k.string,
    groupVersion: k.groupVersion,
    labels: labels,
    title: title,
    body: encoding.b64encode(JSON.stringify(body)),
    meta: encoding.b64encode(JSON.stringify(metadata))
  }
}

export const isLucky = (chance) => {
  while (chance > 1.00) {
    chance = chance / 10
  }
  const yes = (Math.random() > (1-chance))
  return yes
}

export const populateConfigInfo = (conf) => {
  configInfo.add(1, {
    address: conf.us.address,
    duration: `${conf.test.durationMins}m`,
    stacks: `${conf.us.maxStacks}`,
    apps: `${conf.us.maxApps}`,
    create_rps: `${conf.us.createRPS}`,
    entity_size: `${conf.us.entitySizeKiB}KiB`
  })
}
