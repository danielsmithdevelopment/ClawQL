import { execFileSync } from 'node:child_process'

function kubectlArgs(rest) {
  const ctx = process.env.KUBE_CONTEXT?.trim()
  return ctx ? ['--context', ctx, ...rest] : rest
}

export function kubectlRun(args) {
  execFileSync('kubectl', kubectlArgs(args), { stdio: 'inherit', env: process.env })
}

export function kubectlExec(args) {
  return execFileSync('kubectl', kubectlArgs(args), {
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 12 * 1024 * 1024,
  }).trim()
}

export function kubectlApplyFile(pathToYaml) {
  execFileSync('kubectl', kubectlArgs(['apply', '-f', pathToYaml]), {
    stdio: 'inherit',
    env: process.env,
  })
}

/** Read base64-decoded secret data key; throws if missing. */
export function getSecretDataKey(namespace, secretName, key) {
  const b64 = kubectlExec([
    'get',
    'secret',
    secretName,
    '-n',
    namespace,
    `-o=jsonpath={.data.${key}}`,
  ])
  if (!b64) {
    throw new Error(`Secret ${namespace}/${secretName} missing data key ${key}`)
  }
  return Buffer.from(b64, 'base64').toString('utf8')
}
