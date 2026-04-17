# Test TLS material

Self-signed **localhost** certificate used only by **`mcp-grpc-transport`** unit tests (`server.test.ts`). **Do not** use in production.

Generated with:

```bash
openssl req -x509 -newkey rsa:2048 -keyout server.key -out server.crt -days 3650 -nodes -subj "/CN=localhost"
```
