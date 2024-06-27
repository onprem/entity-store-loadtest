## This is a self-documented Makefile. For usage information, run `make help`:
##
## For more information, refer to https://www.thapaliya.com/en/writings/well-documented-makefiles/

.DEFAULT_GOAL:=help
SHELL:=/bin/bash

.PHONY: help start bench stop logs clean bench-local

help:  ## Display this help
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n\nTargets:\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

start:  ## Start US and related services for benchmarking
	$(info Starting services using docker-compose)
	docker-compose up -d

bench: ## Run benchmarking script using k6 container image
	docker run --rm -i --network="host" \
	-v ${PWD}/k6:/app -w /app \
	-e K6_PROMETHEUS_RW_TREND_STATS="p(95),p(99),min,max" \
	-e K6_PROMETHEUS_RW_SERVER_URL=http://localhost:9090/api/v1/write \
	-e K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM=true \
	-e K6_PROMETHEUS_RW_PUSH_INTERVAL=10s \
	-e K6_TEST_ID="$(shell date +%s)" \
	-e K6_US_CREATE_RPS="300" \
	grafana/k6:0.51.0 run -o experimental-prometheus-rw script.js

stop: ## Stop the services without re-setting container state
	docker-compose stop

logs: ## Tail logs for all services running
	docker-compose logs -f

clean: ## Stop services and clean up container state
	$(info Stopping services and cleaning up state)
	docker-compose down

bench-local: ## Run benchmarking script using locally installed k6
	K6_PROMETHEUS_RW_TREND_STATS="p(95),p(99),min,max" \
	K6_PROMETHEUS_RW_SERVER_URL=http://localhost:9090/api/v1/write \
	K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM=true \
	K6_PROMETHEUS_RW_PUSH_INTERVAL=10s \
	K6_PROMETHEUS_RW_STALE_MARKERS=true \
	K6_TEST_ID="$(shell date +%s)" \
	k6 run -o experimental-prometheus-rw ./k6/script.js
