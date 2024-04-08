import encoding from 'k6/encoding';
import exec from 'k6/execution';
import { crypto } from 'k6/experimental/webcrypto';
import config from './config.js';

const randomNameHash = crypto.randomUUID().substring(24).toLowerCase();

export const getKey = () => {
  const appID = exec.scenario.iterationInTest % config.maxApps;
  const eID = exec.vu.iterationInInstance;

  const key = {
    // namespace: `stack-${Date.now() % config.maxStacks}`,
    namespace: 'stack-404',
    group: `${appID}.apps.grafana.com`,
    groupVersion: `v0alpha${appID % 3}`,
    resource: `someres-${appID}`,
    name: `sample-${randomNameHash}-${appID}-${eID}`,
    string: ``,
    allObjectsScoped: ``,
    allObjects: ``,
  };

  // /<group>/<resource>[/namespaces/<namespace>][/<name>[/<subresource>]]
  key.string = `/${key.group}/${key.resource}/namespaces/${key.namespace}/${key.name}`;

  key.allObjectsScoped = key.string.replace(/sample-[\w\d]+-\d+-\d+/, '');
  key.allObjects = key.allObjectsScoped.replace(/\/namespaces\/\s+/, '')

  return key;
}

export const newEntity = () => {
  const k = getKey()

  const labels = {"grafana.app/name": k.name}
  const title = "The " + k.name
  const metadata = {name: k.name, labels: k.labels}
  const body = {metadata: metadata, spec: {title: title}}

  return {
    key: k.string,
    groupVersion: k.groupVersion,
    labels: labels,
    title: title,
    body: encoding.b64encode(JSON.stringify(body)),
    meta: encoding.b64encode(JSON.stringify(metadata))
  }
}

export const isLucky = (chance = 0.5) => {
  while (chance > 1.00) {
    chance = chance / 10
  }
  const yes = (Math.random() > (1-chance))
  return yes
}
