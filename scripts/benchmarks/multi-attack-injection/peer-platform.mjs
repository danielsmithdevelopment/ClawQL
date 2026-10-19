/**
 * Platform stamp for peer CI artifacts.
 *
 * Obot is expected on a Mac mini (Docker Desktop VM is fine for this board —
 * we measure attack effectuation, not speed/memory). Bifrost/Executor smoke
 * peers ran on Linux. Record the host so readers are not left to wonder.
 */
import { platform as nodePlatform, arch, release, type as osType } from "node:os";

/**
 * @param {object} [extra]
 */
export function peerPlatformStamp(extra = {}) {
  const forced = process.env.MAI_PEER_PLATFORM?.trim();
  const host = forced || nodePlatform(); // darwin | linux | win32
  const label =
    host === "darwin"
      ? "macOS"
      : host === "linux"
        ? "Linux"
        : host === "win32"
          ? "Windows"
          : host;
  const dockerPresent =
    process.env.MAI_PEER_DOCKER === "1" || Boolean(process.env.DOCKER_HOST);
  // Docker Desktop on macOS always runs peers inside a Linux VM — fine for
  // effectuation outcomes (not a performance board).
  const dockerVm =
    process.env.MAI_PEER_DOCKER_VM === "1" ||
    (host === "darwin" && dockerPresent);
  return {
    host_os: host,
    host_os_label: label,
    host_arch: arch(),
    host_release: release(),
    host_type: osType(),
    docker_present: dockerPresent,
    docker_vm: dockerVm || null,
    docker_vm_note:
      host === "darwin"
        ? "Docker Desktop Linux VM is fine for this board (attack effectuation, not performance)."
        : null,
    measured_on:
      process.env.MAI_PEER_MEASURED_ON?.trim() ||
      (host === "darwin" ? "mac_mini" : null),
    ...extra,
  };
}
