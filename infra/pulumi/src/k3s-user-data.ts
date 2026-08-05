/**
 * Cloud-init / user-data for ClawQL IDP K3s bootstrap node (Ubuntu 24.04).
 * Installs K3s without Traefik, prepares for Argo CD + clawql-idp Helm via GitOps.
 */
export type K3sBootstrapUserDataOpts = {
  /** Hostname tag for the node. */
  nodeName?: string;
  /** Disable Traefik (default true — use ingress-nginx via GitOps). */
  disableTraefik?: boolean;
  /** Optional R2 endpoint hint written to /etc/clawql/bootstrap.env (no secrets). */
  r2Bucket?: string;
  /** GitOps repo URL operators should point Argo CD at after kubeconfig is available. */
  gitopsRepoUrl?: string;
};

export function buildK3sBootstrapUserData(opts: K3sBootstrapUserDataOpts = {}): string {
  const nodeName = opts.nodeName ?? "clawql-idp-k3s";
  const disableTraefik = opts.disableTraefik !== false;
  const r2Bucket = opts.r2Bucket ?? "";
  const gitopsRepo = opts.gitopsRepoUrl ?? "https://github.com/danielsmithdevelopment/ClawQL.git";

  const k3sInstallFlags = [
    `--tls-san $(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 || hostname -I | awk '{print $1}')`,
    `--node-name ${nodeName}`,
  ];
  if (disableTraefik) {
    k3sInstallFlags.push("--disable traefik");
  }

  return `#!/bin/bash
set -euxo pipefail
export DEBIAN_FRONTEND=noninteractive

hostnamectl set-hostname ${nodeName} || true
mkdir -p /etc/clawql /var/lib/clawql

cat >/etc/clawql/bootstrap.env <<EOF
CLAWQL_PROFILE=idp-k3s
CLAWQL_R2_BUCKET=${r2Bucket}
CLAWQL_GITOPS_REPO=${gitopsRepo}
CLAWQL_GITOPS_PATH=deployment/gitops
EOF

apt-get update -y
apt-get install -y curl jq ca-certificates open-iscsi nfs-common
systemctl enable --now iscsid || true

# Install K3s (single-node control-plane + worker)
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="${k3sInstallFlags.join(" ")}" sh -

# Wait for node Ready
for i in $(seq 1 60); do
  if kubectl --kubeconfig /etc/rancher/k3s/k3s.yaml get nodes 2>/dev/null | grep -q Ready; then
    break
  fi
  sleep 5
done

# Mark bootstrap complete
kubectl --kubeconfig /etc/rancher/k3s/k3s.yaml -n kube-system create configmap clawql-bootstrap \\
  --from-literal=profile=idp-k3s \\
  --from-literal=gitops_repo=${gitopsRepo} \\
  --dry-run=client -o yaml | kubectl --kubeconfig /etc/rancher/k3s/k3s.yaml apply -f -

cat >/etc/clawql/NEXT_STEPS.txt <<'EOF'
1. Copy kubeconfig: sudo cat /etc/rancher/k3s/k3s.yaml
2. Install Argo CD (Helm) into argocd namespace
3. Apply deployment/gitops/projects/clawql.yaml
4. Apply deployment/gitops/applications/root.yaml (app-of-apps)
5. Sync clawql-idp + clawql-workflows Applications
6. Enable MCP: CLAWQL_ENABLE_WORKFLOW=1 CLAWQL_ENABLE_ARGO_CD=1
See docs/deployment/hosted-live-bootstrap.md
EOF

echo "ClawQL K3s bootstrap complete"
`;
}
