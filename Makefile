## This is a self-documented Makefile. For usage information, run `make help`:
##
## For more information, refer to https://www.thapaliya.com/en/writings/well-documented-makefiles/

.DEFAULT_GOAL:=help
SHELL:=/bin/bash

.PHONY: help start stop logs clean bench

help:  ## Display this help
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n\nTargets:\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

start:  ## Start US and related services for benchmarking
	$(info Starting services using docker-compose)
	docker-compose up -d

stop: ## Stop the services without re-setting container state
	docker-compose stop

logs: ## Tail logs for all services running
	docker-compose logs -f

clean: ## Stop services and clean up container state
	$(info Stopping services and cleaning up state)
	docker-compose down

bench: ## Run benchmarking script using k6
	K6_PROMETHEUS_RW_TREND_STATS="p(95),p(99),min,max" \
	K6_PROMETHEUS_RW_SERVER_URL=http://localhost:9090/api/v1/write \
	K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM=true \
	K6_PROMETHEUS_RW_PUSH_INTERVAL=10s \
	k6 run -o experimental-prometheus-rw --tag testid=$(shell date +%s) ./k6/script.js
