# entity-store loadtest

## Usage

- You can use the provided docker-compose.yaml to run Storage Server along with CockroachDB by default.
  - The configuration can be cahnged by modifying `data/grafana/grafana.ini`

- Once the storage server is up and connected to database, fire the k6 script by running `k6 run k6/script.js`.
