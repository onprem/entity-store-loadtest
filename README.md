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
  stop        Stop the services without re-setting container state
  logs        Tail logs for all services running
  clean       Stop services and clean up container state
  bench       Run benchmarking script using k6
```

### Benchmark

> NOTE: k6 needs to be installed and available in $PATH to run benchmark.

Running `make bench` starts the benchmark using k6, the results are shown on the
terminal as well as pushed as timeseries to a Prometheus server. 

A Grafana instance can be accessed on [http://localhost:3000](http://localhost:3000).
There is a dashboard available to visualise the test results.
