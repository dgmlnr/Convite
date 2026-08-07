import { createServer, type AddressInfo, type Server } from "node:net";

function bindEphemeral(): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve(server);
    });
  });
}

/**
 * Returns `count` genuinely free, mutually distinct ports. Practical trap
 * (apply prompt): "prefer ephemeral ports over hardcoded ones so the suite
 * does not fight leftovers." Binding every probe server SIMULTANEOUSLY
 * before closing any of them is what guarantees distinctness — allocating
 * one port, closing it, then asking the OS for another risks the OS handing
 * back the exact same port it just freed.
 */
export async function getFreePorts(count: number): Promise<number[]> {
  const servers = await Promise.all(Array.from({ length: count }, () => bindEphemeral()));
  const ports = servers.map((server) => (server.address() as AddressInfo).port);
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  return ports;
}
