# entity-store loadtest

A k6 script to load test entity store gRPC API.

### Usage

A `Makefile` is provided with targets to run services using docker compose,
running bechmarking script, and cleaning up.

```bash
$ make help

Usage:
  make <target>

Targets:
  help        Display this help
  start       Start US and related services for benchmarking
  bench       Run benchmarking script using k6 container image
  stop        Stop the services without re-setting container state
  logs        Tail logs for all services running
  clean       Stop services and clean up container state
  bench-local  Run benchmarking script using locally installed k6
```

### Benchmark

#### Quickstart

- Make sure you have docker and docker-compose installed and running.
- Run `make start` to start required services.
- Run `make bench` to run the load test. This doesn't require k6 to be installed
  locally as it uses the grafana/k6 container image.
- View the results in the terminal output or visit [http://localhost:3000](http://localhost:3000)
  to explore the metrics in Grafana.

#### Notes

Running `make bench` starts the benchmark using k6, the results are shown on the
terminal as well as pushed as timeseries to a Prometheus server. 

A Grafana instance can be accessed on [http://localhost:3000](http://localhost:3000).
There is a dashboard available to visualise the test results.

You can customize some properties of the load test by changing the config in `k6/config.js`.
The test duration is controlled by changing the duration for various stages in the scenarios.
