# Curated AWS APIs (top 50)

Pinned **OpenAPI 3** YAML for 50 common AWS services — compute, storage, networking, security, data, and CI/CD.

Manifest lists all slugs: [`../aws-top50-apis.json`](../aws-top50-apis.json).

**Source:** [APIs.guru](https://api.apis.guru/) OpenAPI conversions ([aws2openapi](https://github.com/APIs-guru/aws2openapi)) of AWS SDK service models.

**Refresh this bundle:**

```bash
npm run refresh-aws-top50
```

**Use with ClawQL:**

```bash
export CLAWQL_PROVIDER=aws
export AWS_ACCESS_KEY_ID=…
export AWS_SECRET_ACCESS_KEY=…
export AWS_REGION=us-east-1
clawql-mcp
```

Single service offline:

```bash
export CLAWQL_SPEC_PATH="$PWD/providers/aws/apis/sts-2011-06-15/openapi.yaml"
export CLAWQL_PROVIDER=aws
```

Catalog: [`../aws-apis-lookup.json`](../aws-apis-lookup.json). Docs: [`../../docs/providers/aws-apis-lookup.md`](../../docs/providers/aws-apis-lookup.md).
