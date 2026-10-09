import { describe, expect, it } from "vitest";
import { isPublicAddress } from "./address";

describe("isPublicAddress", () => {
  it.each([
    "93.184.215.14",
    "8.8.8.8",
    "2606:2800:21f:cb07:6820:80da:af6b:8b2c",
    "[2a00:1450:4001:80b::200e]",
  ])("allows public %s", (ip) => expect(isPublicAddress(ip)).toBe(true));

  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // cloud metadata
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "198.51.100.7",
    "::1",
    "::",
    "fe80::1",
    "fe80::1%eth0",
    "fc00::1",
    "fd12:3456::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "0:0:0:0:0:ffff:a9fe:a9fe", // mapped metadata address
    "64:ff9b::a9fe:a9fe", // NAT64
    "2002:7f00:1::", // 6to4
    "2001:db8::1",
    "ff02::1",
    "localhost",
    "not an ip",
    "",
  ])("refuses %s", (ip) => expect(isPublicAddress(ip)).toBe(false));
});
