# Least-privilege policy for External Secrets Operator (Kubernetes auth → role clawql-eso-read).
# Apply: vault policy write clawql-eso-read -=@docs/deployment/vault-policy-clawql-eso-read.hcl
#
# KV v2 mounts use secret/data/<path> and secret/metadata/<path>.

path "secret/data/clawql/providers" {
  capabilities = ["read"]
}

path "secret/metadata/clawql/providers" {
  capabilities = ["read", "list"]
}
