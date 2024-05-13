function loadConf() {
  let dc = {
    us: {
      address: 'localhost:10000',
      maxStacks: 1000,
      maxApps: 30,
      createRPS: 300,
      chanceUpdate: 0.1,
      chanceDelete: 0.1,
      entitySizeKiB: 10,
    },
    cloud: {
      projectID: 3694645,
      name: 'Unified Storage LoadTest',
    },
    test: {
      durationMins: 5,
      testID: 'default',
    },
  };

  dc.us.maxStacks = Math.round(fromEnvOrDefault('K6_US_MAX_STACKS', dc.us.maxStacks))
  dc.us.maxApps = Math.round(fromEnvOrDefault('K6_US_MAX_APPS', dc.us.maxApps))
  dc.us.createRPS = fromEnvOrDefault('K6_US_CREATE_RPS', dc.us.createRPS)
  dc.us.chanceDelete = fromEnvOrDefault('K6_US_CHANCE_DELETE', dc.us.chanceDelete)
  dc.us.chanceUpdate = fromEnvOrDefault('K6_US_CHANCE_UPDATE', dc.us.chanceUpdate)
  dc.us.entitySizeKiB = fromEnvOrDefault('K6_US_ENTITY_SIZE', dc.us.entitySizeKiB)

  dc.cloud.projectID = Math.round(fromEnvOrDefault('K6_CLOUD_PROJECT_ID', dc.cloud.projectID))

  dc.test.durationMins = Math.round(fromEnvOrDefault('K6_TEST_DURATION_MINS', dc.test.durationMins))
  
  if (__ENV.K6_US_ADDRESS && __ENV.K6_US_ADDRESS !== '') {
    dc.us.address = __ENV.K6_US_ADDRESS
  }
  if (__ENV.K6_TEST_ID && __ENV.K6_TEST_ID !== '') {
    dc.test.testID = __ENV.K6_TEST_ID
  }
  if (__ENV.K6_CLOUD_NAME && __ENV.K6_CLOUD_NAME !== '') {
    dc.cloud.name = __ENV.K6_CLOUD_NAME
  }

  return dc
}

function fromEnvOrDefault(key, def) {
  let val = __ENV[key];
  if (!val || val === "") {
    return def
  }

  let num = Number.parseFloat(val);
  if (Number.isNaN(num)) {
    return def
  }

  return num
}

const config = loadConf();

export default config;
