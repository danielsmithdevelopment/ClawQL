# Homelab and workloads overview

**Updated 2026-11-12 · Owner: Daniel Smith**

What each machine is, what runs on it, and how internal testing, benchmarking and fine-tuning are done. Related documents: the [Harvey LAB right-sizing remeasure handoff](../benchmarks/harvey-lab-rightsizing-remeasure-handoff.md), the [security testing plan](../security/clawql-security-testing-plan.md), the [/durability page draft](../gtm/clawql-durability-page-draft.md), [durability mode on authorizing boards](../benchmarks/program-cell-fleet-kill/DURABILITY_MODE.md), and [`clawql-network` v0.2](../specs/network/clawql-network-v0.2.md).

## 1. Machines

| Machine | Hardware | Role |
| --- | --- | --- |
| Mac mini M4 Pro | 64 GB unified memory, built-in 10GbE | Hermes's model server and Mac-only integrations; Harvey LAB phase 1 measurement host; authorizing durability-soak host; deployment target for fine-tuned models |
| MS-A2 + RTX 5090 | Ryzen 9 9955HX (16 cores), 96 GB DDR5, 2 TB mirrored NVMe scratch, dual 10G SFP+ and dual 2.5G; RTX 5090 (32 GB) over OCuLink | GPU node: training, rollout generation, fast inference |
| N5 Pro (TrueNAS SCALE) | Ryzen AI 9 HX PRO 370 (12 cores, 50 TOPS NPU, Radeon 890M), 96 GB ECC, 4 TB mirrored NVMe hot tier, 40 TB RAID-Z2 cold tier, 10GbE plus 5GbE | Storage of record and always-on services; planned home of the ClawQL stack and Hermes (sections 3.2, 3.5 and 3.6) |
| Mac Studio | 256 GB, M5 Ultra (planned 36-month lease; evaluate within the 14-day cancellation window) | Large local models, the fine-tuning teacher, sovereign demos |
| MacBook Air M4 | 32 GB | Daily driver; optional inference node when docked |
| MacBook Pro M3 Pro | 36 GB | Planned to be replaced; hold the 128 GB MacBook Pro until the Studio proves out |

**OCuLink:** the 5090's link is PCIe 4.0 x4, about 8 GB/s. Fine for training and inference, where weights load once and stay in VRAM; a bottleneck for anything that streams weights from host memory during use.

## 2. Network and power

- **Network:** Netgate 6100 MAX router; a Netgear MS510TXUP managed switch as the lab's main fabric (802.1Q VLANs and PoE++; four 2.5G ports, four 10G multi-gig ports and two SFP+ ports, with the MS-A2 connected over DAC cables; about 1.25 GB/s between any two 10G machines); two TP-Link Omada EAP770 Wi-Fi 7 access points, to be set up with a wireless mesh backhaul that gives the lab switch its only internet path (section 2.1); Headscale and Tailscale across all machines.
- **UPS:** covers the router, switch, N5 Pro and Mac mini. The MS-A2 and 5090 are deliberately off the UPS, since training checkpoints and resumes.
- **Electricity:** about $0.50 per kWh. Every watt running around the clock costs about $0.37 a month. Typical monthly cost at idle around the clock: Mac mini about $2.50, Mac Studio about $5.50, MS-A2 with 5090 about $36.
- **Practices:** run Hermes and other always-on work on the low-idle machines; sleep the MS-A2 between jobs and wake it over the network; cap the 5090's power limit for training and inference; schedule long batch jobs overnight on time-of-use plans.

### 2.1 Planned network setup (not yet done)

**Current state (2026-11-12):** a Spectrum router provides internet and Wi-Fi in the first room. The lab is in another room with no possible cable run to it. Lab machines (Mac mini, MS-A2) reach the internet over Wi-Fi from the Spectrum router; the 10GbE lab switch, and the N5 Pro on it, have no internet. The Netgate, the EAP770s, pfSense VLANs and Mullvad are not yet set up.

**Target topology:**

- **First room:** the Netgate 6100 MAX replaces the Spectrum router; the modem connects to its WAN port (if Spectrum supplied a combined modem and router, put it in bridge mode or use a separate modem). EAP770 #1 connects by cable to the Netgate and becomes the root access point and the home's Wi-Fi.
- **Lab room:** EAP770 #2 connects to the 10GbE switch's 2.5G port and links to EAP770 #1 over a dedicated wireless backhaul. That backhaul is the lab switch's only path to the router, so every wired lab machine (N5 Pro, Mac mini, MS-A2, Studio) reaches the internet over Ethernet through it. EAP770 #2 also provides Wi-Fi in the lab room.
- **Capacity:** the internet connection is 1 Gbps; the backhaul typically carries 2–3 Gbps in good conditions and the 2.5G port caps the link, so neither limits internet traffic. Traffic between lab machines stays on the 10GbE switch and never crosses the wireless link.

**Wireless backhaul notes:**

- **One path per machine:** after cutover, turn off Wi-Fi on the Mac mini and MS-A2 (or make Ethernet the preferred connection), so each has exactly one path.
- **Keep lab traffic local:** devices that talk to each other often (for example Hermes's containers and the Mac mini's model server) stay on the same lab network, so their traffic never hairpins across the wireless link to pfSense and back.
- **VLANs over the mesh:** confirm that the Omada firmware passes VLAN-tagged traffic to wired devices behind EAP770 #2. If it does not, the lab side runs a single network and pfSense filters by address.
- **Link loss:** if the backhaul drops, Hermes loses Telegram and ClawQL loses upstream APIs, but local inference, storage and lab work continue. Monitor the link and alert when it drops.
- **Power:** the existing UPS covers the lab room. Add one in the first room for the Netgate, modem and EAP770 #1, or the lab loses internet in any outage regardless.

**VLANs:**

| VLAN | Members | Internet |
| --- | --- | --- |
| Management | Netgate, switch, access points, Omada controller, TrueNAS admin interface | None, except update windows |
| Lab | NAS host, MS-A2, Mac mini, Studio, and the Hermes and ClawQL containers on their own addresses | Per-address allowlist on pfSense; the NAS host has none (section 3.6) |
| Trusted | Laptops, phones | Full, through Mullvad |
| IoT and guest | Everything else | Through Mullvad; no access to other VLANs |

Traffic between VLANs is denied by default and opened rule by rule. The lab switch, a Netgear MS510TXUP, is managed and supports 802.1Q VLANs, so the lab side can carry tagged VLANs from the mesh.

**Mullvad on pfSense:**

- **Per-VLAN routing decision:** some services challenge or block VPN addresses (payment dashboards such as Stripe, banks, some cloud consoles). Consider exempting those destinations, or the lab VLAN, so benchmarks calling external APIs keep a stable, documented network path.
- **Kill switch:** if the tunnel drops, traffic routed through it is blocked, never sent out unprotected.
- **No leaks:** DNS goes through the tunnel; IPv6 is handled deliberately; leak tests confirm both.
- **Tailscale and Headscale:** confirm coordination and relay traffic still works before switching everything over.
- **Nothing inbound:** Mullvad no longer offers port forwarding, which matches the outbound-only design.
- **Throughput:** check the Netgate's WireGuard throughput against the internet connection's speed.

**Order of work:**

1. Confirm the hardware: the Spectrum modem is separate from its router, so no bridge mode is needed; the lab switch is a managed Netgear MS510TXUP.
2. Plan VLANs and address ranges.
3. Install the Netgate in place of the Spectrum router: WAN, interfaces, DHCP, DNS and default-deny rules between VLANs. Add a UPS for the first room.
4. Omada: adopt both EAP770s with the controller running temporarily on a laptop (or Omada's standalone app), set up the mesh backhaul, and map Wi-Fi networks to VLANs.
5. Verify VLAN-tagged traffic passes to the switch behind EAP770 #2.
6. Cut the lab over: switch internet through EAP770 #2; turn off Wi-Fi on the Mac mini and MS-A2.
7. Move the Omada controller to the N5 Pro.
8. Mullvad: WireGuard tunnel, policy routing per VLAN, kill switch, leak tests.
9. Give the Hermes and ClawQL containers their own lab addresses and pfSense allowlists.
10. Run the isolation tests from the security testing plan, set up backhaul monitoring, and back up the pfSense configuration.

### 2.2 Setup runbook

Step-by-step instructions for the migration in section 2.1. Menu names follow current pfSense Plus and Omada Software Controller releases; labels can differ slightly by version, so follow the closest match and check Netgate's and TP-Link's documentation when a screen looks different. The Spectrum modem is separate from the Spectrum router, so only the router is replaced, and it can be returned at the end ($5 a month saved).

#### Phase 0: Prepare

1. **Hardware checks.**
   - Read each EAP770's label for its hardware version. Version 1 has a 10G port (802.3bt PoE or 12V DC); version 2 has a 2.5G port (802.3at PoE or 12V DC, adapter included). Power EAP770 #1 with its 12V DC adapter, since the Netgate has no PoE. EAP770 #2 is powered by the lab switch's PoE++ (802.3bt), which suits either version. During staging in Phase 3 both access points need power at once next to the Netgate, so have two 12V DC adapters (version 2 includes one) or an 802.3bt injector for EAP770 #2.
   - The lab switch is a Netgear MS510TXUP: managed, with 802.1Q VLANs and PoE++ on its copper ports. Update its firmware before starting, and note its current management address and admin credentials.
   - Have two Ethernet cables, a laptop with an Ethernet port, and a second device for Wi-Fi tests.
   - Add a UPS in the router room for the modem, the Netgate and EAP770 #1.
2. **Address plan.** Use ranges that do not overlap the Spectrum router's (which usually uses 192.168.1.0/24), so nothing collides during cutover:

| Network | VLAN tag | Subnet | Gateway | Notes |
| --- | --- | --- | --- | --- |
| Management | none (untagged, native) | 10.10.1.0/24 | 10.10.1.1 | Access points' own addresses; pfSense admin |
| Lab | 20 | 10.10.20.0/24 | 10.10.20.1 | Wired lab machines and containers |
| Trusted | 30 | 10.10.30.0/24 | 10.10.30.1 | Laptops and phones |
| IoT and guest | 40 | 10.10.40.0/24 | 10.10.40.1 | Everything else |

Reserve static addresses outside the DHCP pools, for example: N5 Pro host 10.10.20.10, Mac mini 10.10.20.11, MS-A2 10.10.20.12, Mac Studio 10.10.20.13, Hermes container 10.10.20.50, ClawQL container 10.10.20.51, Omada controller container 10.10.20.52; EAP770 #1 10.10.1.21, EAP770 #2 10.10.1.22, MS510TXUP management 10.10.1.23.

3. **Inventory exceptions.** List services that must bypass Mullvad (banks, payment dashboards such as Stripe, anything that blocks VPN addresses) and the upstream APIs ClawQL calls. Headscale moves to a small VPS (section 3.7), so the home network needs no inbound exceptions. Set up the VPS before the migration, so remote access works throughout.
4. **Choose a maintenance window.** Internet will be down for parts of Phases 1 and 4.

#### Phase 1: Bring up the Netgate (router room)

1. **Offline first.** Power the Netgate with its WAN unplugged. Connect the laptop to LAN port 1. Browse to `https://192.168.1.1` and sign in with the default credentials from the quick-start card.
2. **Setup wizard:** set the hostname and domain (for example `pfsense` and `home.arpa`), time zone, and WAN type DHCP; leave DNS servers blank for now; set the LAN address to **10.10.1.1/24**; set a strong admin password. After the wizard, reconnect to `https://10.10.1.1`.
3. **Check port assignments** under Interfaces → Assignments. Note which physical port is WAN; the Spectrum modem's 1 Gbps Ethernet connects to one of the 1 Gbps combo WAN ports. Make LAN port 1 (a 2.5 Gbps port) the LAN interface; EAP770 #1 will plug in there.
4. **Update** under System → Update to the current stable release, and reboot.
5. **Harden:** System → Advanced → Admin Access: HTTPS only, enable the login protection defaults, and if SSH is enabled use key-only authentication. Confirm no rule allows the web interface from WAN. Leave UPnP disabled (Services → UPnP).
6. **Connect the modem.** Power off the Spectrum modem, disconnect the Spectrum router, cable the modem to the Netgate's WAN port, then power the modem back on. Spectrum modems often remember the first router they see, so if WAN gets no address after a few minutes, power the modem off for 5–10 minutes and try again. Confirm under Status → Interfaces that WAN has a public address.
7. **Basic DNS and time:** Services → DNS Resolver: enable, DNSSEC on, listen on all internal interfaces. (Mullvad DNS is added in Phase 5.) Services → NTP: enable on internal interfaces.
8. **Quick test:** from the laptop, load a website and run a speed test. Expect close to 1 Gbps down.
9. **Back up:** Diagnostics → Backup & Restore → download configuration. Enable Services → Auto Config Backup with a strong encryption password.

#### Phase 2: VLANs, DHCP and firewall rules

1. **Create VLANs:** Interfaces → Assignments → VLANs → Add, with the parent interface set to LAN port 1. Create tags 20 (Lab), 30 (Trusted) and 40 (IoT).
2. **Assign them:** Interfaces → Assignments, add each VLAN, then open each new interface: enable it, rename it (LAB, TRUSTED, IOT), and set a static IPv4 address of x.x.x.1/24 from the address plan. Leave IPv6 set to none on internal interfaces for now; this avoids IPv6 leaks around the VPN (see Phase 5, step 8).
3. **DHCP:** Services → DHCP Server, for each interface (LAN/management, LAB, TRUSTED, IOT): enable, set a pool (for example .100 to .199), and set the DNS server to the interface's own address. Under LAN, add static mappings for both access points; under LAB, add static mappings for the lab machines by MAC address.
4. **Aliases** (Firewall → Aliases):
   - `PRIVATE_NETS`: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16.
   - `LAB_HOSTS_INTERNET`: Mac mini, MS-A2, Mac Studio (lab machines allowed general internet).
   - `NAS_HOST`: 10.10.20.10.
   - `HERMES_CT` and `CLAWQL_CT`: the containers' addresses.
   - `TELEGRAM_API`: api.telegram.org (a host alias resolves names periodically; Telegram also publishes its IP ranges, which can be loaded as a URL table alias instead).
   - `CLAWQL_UPSTREAMS`: the hostnames of the APIs ClawQL calls.
   - `VPN_BYPASS`: destinations exempt from Mullvad.
   - `OMADA_PORTS`: the controller ports listed in TP-Link's documentation for your controller version (discovery and adoption ports in the 29810–29817 range).
5. **Firewall rules** (Firewall → Rules, per interface; rules match top to bottom, first match wins). Traffic between machines on the same lab switch stays on that switch and never reaches pfSense, so these rules govern only traffic that crosses networks or leaves for the internet.

**LAN (management):**

| # | Action | Source | Destination | Notes |
| --- | --- | --- | --- | --- |
| 1 | Pass | LAN net | LAN address: 443, 53, 123 | Admin, DNS and time |
| 2 | Pass | LAN net | Omada controller, `OMADA_PORTS` | Access points reach the controller |
| 3 | Block | LAN net | any | Everything else, logged |

Keep the anti-lockout rule until admin access from Trusted is confirmed.

**LAB:**

| # | Action | Source | Destination | Notes |
| --- | --- | --- | --- | --- |
| 1 | Pass | LAB net | LAB address: 53, 123 | DNS and time |
| 2 | Pass | Omada controller | LAN net | Controller manages access points |
| 3 | Pass | `HERMES_CT` | `TELEGRAM_API`: 443 | Messaging only |
| 4 | Pass | `CLAWQL_CT` | `CLAWQL_UPSTREAMS`: 443 | Upstream APIs only |
| 5 | Block | `NAS_HOST` | any | The NAS host stays offline, logged |
| 6 | Pass | `LAB_HOSTS_INTERNET` | not `PRIVATE_NETS` | General internet for lab machines |
| 7 | Block | LAB net | any | Everything else, including other networks, logged |

For container registries and TrueNAS updates, add a disabled rule passing `NAS_HOST` to the needed hosts and enable it only during maintenance windows (or attach a schedule under Firewall → Schedules).

**TRUSTED:**

| # | Action | Source | Destination | Notes |
| --- | --- | --- | --- | --- |
| 1 | Pass | TRUSTED net | TRUSTED address: 53, 123 | DNS and time |
| 2 | Pass | your admin devices | LAN address: 443 | pfSense admin |
| 3 | Pass | TRUSTED net | LAB net (ports you use: SSH, web interfaces, ClawQL) | Reach the lab |
| 4 | Block | TRUSTED net | `PRIVATE_NETS` | No other internal access |
| 5 | Pass | TRUSTED net | any | Internet (gateway set in Phase 5) |

**IOT:**

| # | Action | Source | Destination | Notes |
| --- | --- | --- | --- | --- |
| 1 | Pass | IOT net | IOT address: 53, 123 | DNS and time |
| 2 | Block | IOT net | `PRIVATE_NETS` | No internal access, logged |
| 3 | Pass | IOT net | any | Internet (gateway set in Phase 5) |

6. **Force internal DNS:** Firewall → NAT → Port Forward, on each internal interface, redirect TCP/UDP 53 not addressed to the firewall back to the firewall's own address. Block TCP 853 (DNS over TLS) outbound from internal networks.
7. **Back up** the configuration again.

#### Phase 3: Omada controller and both access points (staged in the router room)

The mesh needs an Omada controller, but the controller's permanent home (the N5 Pro) is on the far side of the mesh. So both access points are set up next to the Netgate first, with the controller running temporarily on the laptop.

1. **Temporary controller:** run the Omada Software Controller on the laptop (Windows and Linux installers are available; on a Mac, use a maintained Docker image of the controller). Connect the laptop to the management network. Open the controller, create an admin account, create a site, and set the country to United States.
2. **Networks in the controller:** Settings → Wired Networks → LAN (or Networks): create VLAN-only networks for Lab (20), Trusted (30) and IoT (40). pfSense remains the router and DHCP server; these are labels the access points use.
3. **Do not enable the management VLAN** for the access points. Their management stays on the untagged management network.
4. **Adopt EAP770 #1:** power it with its DC adapter, cable it to the Netgate's LAN port 1. It appears as Pending under Devices; adopt it, then update its firmware.
5. **Adopt EAP770 #2 wired first:** power it with the second DC adapter or the injector and temporarily cable it to a second LAN port on the Netgate (or a small switch on LAN port 1). Adopt it and update its firmware. Confirm both have their reserved management addresses.
6. **Enable mesh:** Settings → Site (or Services) → Mesh: turn on Mesh and Auto Failover.
7. **Wireless networks:** Settings → Wireless Networks: create the Trusted SSID tagged to VLAN 30 and the IoT SSID tagged to VLAN 40 (2.4 and 5 GHz only for IoT; enable client isolation). Use WPA3 (or WPA2/WPA3 transitional for older devices) and strong passphrases.
8. **Convert EAP770 #2 to mesh:** unplug its Ethernet cable but keep its power on. Within a few minutes it should reconnect wirelessly; in Devices its uplink shows as mesh (wireless) through EAP770 #1. If it does not, plug it back in, confirm Mesh is enabled, and retry.
9. **Check which band the backhaul uses** on EAP770 #2's details page. Keep that band's channel fixed and uncrowded, and if lab-room Wi-Fi clients are few, consider limiting user access on the backhaul band of EAP770 #2 to leave its capacity for backhaul.
10. **Export a controller backup:** Settings → Maintenance → Backup.

#### Phase 4: Move EAP770 #2 to the lab and connect the switch

1. **Place it:** power EAP770 #2 temporarily (DC adapter or injector) in the lab room where it has the clearest path to EAP770 #1 (high, few walls). In the controller, confirm it reconnects as a mesh device.
2. **Check signal:** the mesh uplink's signal should be strong (better than about -65 dBm) with a high link rate. If not, move it and recheck before continuing.
3. **Configure the Netgear MS510TXUP** in its local web interface (or in Insight, if you manage it there). Work from a computer plugged into a port you are not changing, and change the uplink port last, so you cannot lock yourself out.
   - Create VLAN 20 (Lab).
   - **Uplink port** (the 2.5G PoE++ port EAP770 #2 will use): member of VLAN 1 untagged (carrying the untagged management network) and VLAN 20 tagged; PVID 1; PoE enabled.
   - **Lab machine ports** (the 10G ports for the N5 Pro, Mac mini and Mac Studio, and the SFP+ ports with the MS-A2's DAC cables): member of VLAN 20 untagged only; PVID 20; removed from VLAN 1.
   - **Switch management:** keep it on VLAN 1 with DHCP, so it takes its reserved address 10.10.1.23 and is reachable only from the management network and admin devices.
   - **MTU:** keep 1500 on anything that crosses the mesh. Enable jumbo frames only between lab machines, and only if a workload needs them.
   - Save the running configuration to the startup configuration.
4. **Configure EAP770 #2's Ethernet port** in the controller (Devices → EAP770 #2 → Config → ports or LAN settings): enable the port, keep untagged traffic on the default management network, and add VLAN 20 as tagged. The mesh access point's Ethernet port is bridged to the network through the root access point.
5. **Cable it:** connect EAP770 #2 to the switch's 2.5G PoE++ uplink port and remove its temporary power. It powers from the switch and rejoins the mesh.
6. **Fallback, if tagged VLAN 20 does not pass over the mesh** (Phase 6, test 2): set EAP770 #2's port to untagged VLAN 20; set the switch uplink port to VLAN 20 untagged with PVID 20; move the switch's management address into the Lab network (10.10.20.23) and update its DHCP reservation. Everything then still works on a single Lab network, with pfSense filtering by address.
7. **Cut over the lab machines:** on the Mac mini and the MS-A2, turn off Wi-Fi (macOS: System Settings → Wi-Fi off; Linux: disable the wireless interface or remove its connection profile). Renew DHCP on the wired interfaces and confirm each gets its reserved 10.10.20.x address.
8. **Move the controller to the N5 Pro:** run the controller container at 10.10.20.52, restore the backup exported in Phase 3, then use the old controller's migration function (Settings → Maintenance or Controller → Migration) to point both access points to 10.10.20.52. Confirm both appear connected on the new controller, then stop the laptop controller.

#### Phase 5: Mullvad on pfSense

1. **Install WireGuard:** System → Package Manager → Available Packages → WireGuard.
2. **Create the tunnel:** VPN → WireGuard → Tunnels → Add. Generate a key pair and copy the public key.
3. **Register the key with Mullvad:** in your Mullvad account, add the WireGuard public key. Note the tunnel address Mullvad assigns to it, and pick a server; note its public key, IP address and port (Mullvad's WireGuard server list shows these).
4. **Add the peer:** VPN → WireGuard → Peers → Add for this tunnel: endpoint = the server's IP address (an address, not a hostname), port = the server's port, public key = the server's, allowed IPs = 0.0.0.0/0, keepalive = 25.
5. **Assign the interface:** Interfaces → Assignments, add the WireGuard interface (for example `tun_wg0`), rename it MULLVAD, enable it, set IPv4 static to Mullvad's assigned tunnel address with a /32 mask, and set the MTU to 1420.
6. **Gateway:** System → Routing → Gateways → Add: interface MULLVAD, name `MULLVAD_GW`, gateway address 10.64.0.1, monitor address 10.64.0.1. Keep the default gateway set to WAN, so the firewall itself and bypass traffic use WAN.
7. **Outbound NAT:** Firewall → NAT → Outbound → Hybrid mode. Add a rule for each network that will use Mullvad (TRUSTED, IOT, and LAB if chosen): interface MULLVAD, source that network, translation = interface address.
8. **Route networks through Mullvad, with a kill switch:**
   - On TRUSTED rule 5 and IOT rule 3, open Advanced and set the gateway to `MULLVAD_GW`, and set a tag such as `VIA_VPN`.
   - Above those rules, add pass rules for `VPN_BYPASS` destinations with the gateway set to WAN.
   - Kill switch: Firewall → Rules → Floating → Add: block, quick, interface WAN, direction out, protocol any, and under Advanced match tag `VIA_VPN`. If the tunnel goes down, tagged traffic is blocked rather than leaving over WAN.
   - Under System → Advanced → Miscellaneous, enable skipping rules when their gateway is down, so a down tunnel never silently falls back to WAN.
   - IPv6 stays disabled on internal networks (Phase 2, step 2), so nothing can leak around the IPv4 tunnel.
9. **No inbound exceptions:** Headscale runs on a VPS (section 3.7), so the home network needs no port forwards at all. Confirm Firewall → NAT → Port Forward holds only the internal DNS redirects from Phase 2, and that WAN has no pass rules.
10. **DNS through the tunnel:** System → General Setup: set DNS server 10.64.0.1 with gateway `MULLVAD_GW`; uncheck allowing DNS servers to be overridden by DHCP on WAN. Services → DNS Resolver: enable forwarding mode, and set outgoing network interfaces to MULLVAD. If the tunnel is down, name resolution stops rather than leaking.
11. **Lab path decision:** decide whether LAB rule 6 uses Mullvad or WAN. WAN gives benchmarks a stable, documented path to external APIs; if Mullvad, apply the same tag and kill switch.
12. **Back up** the configuration.

#### Phase 6: Verify everything

Run every check, record the results with the date in this document, and fix anything that fails before returning the Spectrum router.

1. **Mesh link:** in the controller, EAP770 #2 shows a mesh uplink with strong signal. Measure throughput across the backhaul from a lab machine to a wired device in the router room (for example the laptop on a Netgate LAN port):

```
# on the laptop (router room)
iperf3 -s
# on the Mac mini (lab)
iperf3 -c <laptop-address> -t 30
iperf3 -c <laptop-address> -t 30 -R
```

Expect at least about 900 Mbps each way. Then check stability:

```
ping -c 1000 -i 0.2 10.10.20.1    # from the Mac mini: under 1% loss, steady latency
```

2. **Internet from the lab:** first confirm the Mac mini holds 10.10.20.11 and can ping 10.10.20.1, which proves VLAN 20 is passing across the mesh (if not, apply the Phase 4 fallback). Then, on the Mac mini, with Wi-Fi off, run a speed test (close to 1 Gbps without Mullvad; somewhat lower through it). Confirm only Ethernet is active: `networksetup -listnetworkserviceorder` and `route -n get default` show the Ethernet interface.
3. **NAS host stays offline:** from the TrueNAS shell, `curl -m 5 https://example.com` must fail, and the block appears in Status → System Logs → Firewall.
4. **Container allowlists:** from inside the Hermes container, `curl -m 5 https://api.telegram.org` succeeds and `curl -m 5 https://example.com` fails. From inside the ClawQL container, one configured upstream succeeds and an unlisted site fails. Send Hermes a Telegram message and confirm a reply.
5. **Isolation between networks:** from an IoT Wi-Fi device, pinging 10.10.20.11 (Mac mini) and 10.10.1.1 must fail. From a Trusted device, the allowed lab ports work, and 10.10.1.1 and the switch's management page (10.10.1.23) are reachable only from your admin devices.
6. **Mullvad and leaks:** on a Trusted device, open Mullvad's connection check page (mullvad.net/check); it should report a Mullvad address and no DNS leak. Also run `curl https://am.i.mullvad.net/json`.
7. **Kill switch:** disable the WireGuard peer in pfSense. A Trusted device must lose internet entirely (no fallback to your Spectrum address). Re-enable it and confirm internet returns. Confirm a `VPN_BYPASS` destination still works over WAN.
8. **DNS enforcement:** on a Trusted device, `dig @8.8.8.8 example.com` should still be answered through pfSense (redirected), and DNS over TLS to an outside resolver on port 853 should fail.
9. **Backhaul failure:** unplug EAP770 #2's power. Lab internet stops, but lab machines still reach each other (`ping 10.10.20.10` from the Mac mini) and local inference still works. Plug it back in; within a few minutes the mesh and internet return, and Hermes reconnects to Telegram on its own.
10. **Remote access:** from a phone on cellular data, confirm Tailscale connects to the lab (through the VPS-hosted Headscale).
11. **Power:** briefly unplug the router-room UPS from the wall; the modem, Netgate and EAP770 #1 stay up.
12. **Monitoring:** set the controller to alert when EAP770 #2 disconnects, and add a gateway alert in pfSense for `MULLVAD_GW` going down.
13. **Final backups:** pfSense configuration and an Omada controller backup, stored on the N5 Pro and off-site.

#### Phase 7: Finish

1. Run normally for about a week. If everything holds, return the Spectrum router and stop the $5 monthly fee; keep the Spectrum modem.
2. Update sections 1, 2 and 3 of this document with the final addresses, and mark section 2.1 as done.

## 3. What runs where

| Service | Now | Planned | Notes |
| --- | --- | --- | --- |
| ClawQL MCP gateway (:8080) | Mac mini | N5 Pro | Move after Harvey LAB phase 1 (section 3.2); needs controlled outbound internet (section 3.6) |
| clawql-inference (:8091) | Mac mini | N5 Pro | Routes to MLX on the Mac mini and vLLM on the MS-A2 |
| Hermes agent and messaging gateway | Mac mini (launchd) | N5 Pro (containers) | Section 3.5; Telegram needs outbound internet only (section 3.6) |
| Hermes model server (MLX or llama.cpp with Metal) | Mac mini (launchd) | Mac mini (launchd) | Containers on macOS cannot use the Apple GPU, so it stays native |
| Mac-only integrations (for example iMessage through BlueBubbles, local files and apps) | Mac mini | Mac mini | Need macOS itself |
| MLX Nemotron 3.5 Lightning (:8081) | Mac mini | Mac mini | Harvey LAB local arms |
| vLLM Qwen3.8-27B | MS-A2 + 5090 | MS-A2 + 5090 | HyperQwen-style speculative decoding is a candidate |
| Fine-tuning (Unsloth, TRL) | MS-A2 + 5090 | MS-A2 + 5090 | Section 6 |
| Teacher model (GLM-5.3-Flash) | None | Mac Studio | Section 6 |
| celld soaks and crash boards | Mac mini (Colima) | Mac mini; N5 Pro as second host | Section 4 |
| MinIO, ClickHouse, Tika, LangExtract, Omada controller, node_exporter | N5 Pro | N5 Pro | TrueNAS apps |
| Shared model and dataset store (NFS) | N5 Pro | N5 Pro | NVMe hot tier; RAID-Z2 archive |
| Local judge for smoke tests (Ollama) | Mac mini | Off the measured host during runs | Never the judge for scored runs |

### 3.1 Decision: the 5090 stays on the MS-A2 (2026-11-12)

Moving it to the N5 Pro's OCuLink port would save one always-on machine but would put GPU driver faults, hung training jobs and non-hot-pluggable reboots inside the storage of record (ZFS pools, the WORM replication target, ClickHouse); tie CUDA driver versions to TrueNAS releases; overload the UPS or force the NAS off battery protection; and compete with ZFS caching for memory. Power savings come instead from sleeping the MS-A2 when idle. If consolidation is revisited, passing the GPU through to a separate VM on the NAS is the safer form.

### 3.2 Decision: the ClawQL stack moves to the N5 Pro (2026-11-12)

The NAS is always on, protected by the UPS and uses ECC memory, which suits the service holding the vault and writing the audit trail; MinIO, ClickHouse and the shared store are already there; and the move removes load from the Mac mini, which contributes to Hermes's slow responses. Hermes calling ClawQL across 10GbE adds well under a millisecond per call.

**Migration checklist:**

- [ ] **Timing:** move only after Harvey LAB phase 1 finishes, or meter the N5 Pro's power for the with-ClawQL arms; otherwise ClawQL's CPU work drops out of the Mac mini's measurement and flatters those arms.
- [ ] **TrueNAS app engine:** the September notes say apps run on k3s, but recent TrueNAS releases moved apps to Docker. Confirm the installed version and deploy accordingly.
- [ ] **Resource limits** on the ClawQL containers so they cannot starve ZFS caching or ClickHouse.
- [ ] **Network access:** Tailscale ACLs allowing only the machines that need the gateway.
- [ ] **Endpoints:** repoint Hermes, the harness and clawql-inference's model routes to the new hostnames, and verify the product-path fingerprint on the new host.
- [ ] **Vault and audit trail:** vault storage encrypted at rest; audit entries still replicate to MinIO before acknowledgment.
- [ ] **Board labels:** new boards name the new host; published boards stay re-runnable on the original setup.
- [ ] **Rollback:** keep the Mac mini deployment able to start until the NAS deployment has run cleanly for a set period.

### 3.3 When the Mac Studio arrives

With Hermes's agent and gateway on the N5 Pro, the Mac mini still serves Hermes's model while also being the benchmark host, so inference contention remains. When the Studio arrives, decide whether Hermes's model moves to the Studio or benchmarking moves; either way, keep the Mac mini able to re-run its published boards.

### 3.4 Items to verify

- [ ] Port 9000: the September notes list both ClickHouse and MinIO on it.
- [ ] Where the k3s control plane runs: the notes place it on the Mac mini in one section and the MS-A2 in another.
- [ ] Where Onyx runs, if anywhere, for the Onyx removal evaluation.

### 3.5 Decision: Hermes runs as containers on the N5 Pro (2026-11-12)

Hermes's agent and messaging gateway move from launchd on the Mac mini to containers on the N5 Pro, calling the Mac mini's model server over 10GbE (well under a millisecond per call, against seconds of model time). Hermes then stays up through Mac mini reboots, updates and benchmark runs; sits next to ClawQL; gets pinned versions, restart policies and rollback; keeps its state on the NVMe hot tier with ZFS snapshots; and frees the Mac mini's memory and CPU for the model.

**Migration checklist:**

- [ ] **Inventory Mac-only dependencies:** Hermes channels and tools that need macOS (for example iMessage through BlueBubbles, local files, apps and automations) stay on the Mac mini or are dropped.
- [ ] **Contain the terminal tool:** no broad dataset mounts, no Docker socket, a non-root user, and outbound traffic through ClawQL. The container runs on the storage of record, so least privilege is mandatory.
- [ ] **Model fallback:** route Hermes's inference through clawql-inference, so that when the Mac mini is unavailable sensitive requests queue with a notification and routine ones may use a capped cloud model.
- [ ] **Outbound only:** messaging connections that poll or connect outward (Telegram long polling), never inbound webhooks to the NAS and never a port forward. If a platform requires webhooks, put a narrow Tailscale Funnel or relay in front.
- [ ] **Secrets:** messaging tokens stored as secrets, not plain environment variables in a compose file.
- [ ] **Resource limits** on the containers, as for ClawQL.
- [ ] **Benchmark windows:** pause Hermes's inference, or route it elsewhere, while a board runs on the Mac mini.
- [ ] **TrueNAS app engine:** confirm custom compose apps on the installed version.
- [ ] **Rollback:** keep the launchd configuration able to start again until the containers have run cleanly for a set period.

### 3.6 Internet access for the N5 Pro

The Telegram gateway and the ClawQL gateway both need outbound internet: Telegram to reach its API by long polling, ClawQL to call every upstream API its tools use. Neither needs anything inbound.

**Policy:** the NAS host itself stays offline. Only the Hermes and ClawQL containers get internet, from their own addresses on the lab network (section 2.1), each with a default-deny outbound allowlist enforced on pfSense: Telegram's API for the messaging gateway; the upstream APIs ClawQL is configured to call; container registries and TrueNAS updates only during maintenance windows. Nothing is allowed inbound. Everything else is blocked and logged. This applies ClawQL's own per-workload, default-deny egress principle to the homelab. A stricter variant routes the containers' traffic through an outbound proxy on another machine.

**Alternative:** keep the N5 Pro fully offline and run the internet-facing pieces (messaging gateway and ClawQL gateway) on the Mac mini instead. That keeps a fully offline storage machine but gives up most of the consolidation in sections 3.2 and 3.5.

- [ ] **Correct the September notes,** which described the N5 Pro's internet path as already working through the mesh and placed EAP770 #2 on the N5 Pro's own port. As of 2026-11-12 the mesh is not set up; under the target topology (section 2.1) EAP770 #2 connects to the lab switch's 2.5G port, giving the whole lab switch internet over the wireless backhaul.

### 3.7 Decision: Headscale runs on a small VPS (2026-11-12)

Headscale must be reachable from the internet so devices away from home can join the tailnet and refresh keys. Hosting it at home would need the network's only inbound port forward, on either the storage of record or the benchmark host. A small VPS (typically around $4–6 a month, roughly what returning the Spectrum router saves) gives it a stable public address and certificate, keeps the home network at zero inbound exceptions, and stays reachable when the home connection or the mesh is down, which is when remote access matters most. Existing Tailscale connections keep working briefly without the control server; new connections and key refreshes need it.

**Setup:**

1. **Provision** a small Linux VPS (1 vCPU and 1 GB of memory is enough) and point a DNS name at it, for example `headscale.<your-domain>`.
2. **Harden it:** SSH key-only with password login disabled; automatic security updates; a host firewall allowing only TCP 443 (Headscale), UDP 3478 (STUN, for the relay) and SSH. Once the VPS has joined the tailnet itself, restrict SSH to tailnet addresses.
3. **Install Headscale** from its official release packages or container image, with `server_url` set to `https://headscale.<your-domain>`. Obtain a certificate with Headscale's built-in ACME support or a reverse proxy such as Caddy.
4. **Enable the embedded DERP relay,** so relayed traffic uses your own server rather than public ones.
5. **Migrate existing nodes.** If Headscale already runs at home, copy its database and private keys to the VPS so nodes keep their identities; otherwise create users and pre-auth keys and re-register each device with `tailscale up --login-server https://headscale.<your-domain> --force-reauth`.
6. **Tailnet ACLs:** write a default-deny Headscale policy that mirrors the home rules: admin devices may reach the lab's admin and service ports; nothing else crosses by default.
7. **Back up** Headscale's database and keys to the N5 Pro over the tailnet on a schedule; treat them as secrets, since they control access to every node.
8. **Monitor:** alert if Headscale's HTTPS endpoint stops responding.

Aligned with [`clawql-network` v0.2 §4](../specs/network/clawql-network-v0.2.md): for the homelab, Headscale runs on a small VPS so the home network needs no inbound access.

## 4. Internal testing

### 4.1 Durability

- **Host:** the Mac mini, in a Colima VM, is the authorizing host. Cloud VMs are not used for authorizing soaks, because host suspends void them. Boards run in celld's default fleet durability mode (two nodes with disk replicas on the one host, R2 as the fleet bucket): writes are acknowledged on a quorum of disks and the bucket upload can finish afterward, so the evidence covers process and node crashes with the host's disks intact, not host-disk, zone or region loss. Every artifact now records the mode (`celldDurability`). See [`DURABILITY_MODE.md`](../benchmarks/program-cell-fleet-kill/DURABILITY_MODE.md) and [`V4_CLAIM.md`](../benchmarks/program-cell-fleet-kill/V4_CLAIM.md).
- **Soak:** 1,000 restart cycles under the frozen soak gates (unique nodes, readiness failures, self-fences), voided only by a monitored suspend.
- **Crash boards:** N=1,000 phased kills (before intent, after intent before call, during the call, after the call before journaling), wedged owners, stale owners, and the storage intent check.
- **Evidence rules:** frozen criteria; append-only logs with no overwrite; per-trial effect ledgers and twin digests; binary identity (commit and SHA-256) recorded in every artifact, and matching between the soak and the board it authorizes.
- **Next:** a second always-on host. Running celld on the N5 Pro as well enables the multi-host boards still open, after its own authorizing soak.

#### Planned: durability across nodes, zones and regions

The v4 board proves crash safety against process and node failures on one host. The next boards extend it to larger failures, first rehearsed in the homelab, then run in a dedicated cloud account.

**The claim at each scope** is decided before choosing tools:

| Fault scope | What "durable" means | What makes it possible |
| --- | --- | --- |
| Process or node | No acknowledged write lost, no duplicates | Proven on one host (v4, authorized 2026-11-09) |
| Availability zone | The same, after losing a whole zone | Acknowledging only after a copy exists in another zone |
| Region | The same after losing a whole region, or a stated maximum loss window | Synchronous replication to another region before acknowledging (adds a cross-country round trip to every durable write), or asynchronous replication with the loss window measured and published |

The region claim states which design it uses: "zero acknowledged-write loss on region loss" or "at most N seconds of acknowledged writes lost". Both are legitimate; the board measures whichever is claimed.

**Tools by scope:**

- **Homelab rehearsal, at no cost:** treat the Mac mini, N5 Pro and MS-A2 as three zones. Partition them with host firewall rules or `tc netem` (lab traffic stays on the switch, so pfSense cannot partition it), and cut a whole machine's power mid-board. Iterate the harness here before spending cloud money.
- **Kubernetes:** Chaos Mesh or LitmusChaos for pod, node and network faults; Toxiproxy for precise latency and partitions on specific connections.
- **AWS:** Fault Injection Service, including its availability-zone power-interruption scenario and network-disruption actions, bounded by stop conditions (CloudWatch alarms) and tag-scoped targets.
- **Azure:** Chaos Studio, if reproducing benchmarks that ran there.
- **Region loss is simulated, not caused:** stop every node in a region, blackhole its network with security groups or network ACLs, and deny access to its bucket with a bucket policy; then fail over and check the ledgers.

**Board design:**

1. Add fault scope (process, node, zone, region) as a dimension of the phased-kill harness, keeping the same kill phases.
2. Measure per scope: wrong outcomes (lost or duplicated), acknowledged writes lost and their age (the measured loss window), recovery time, and availability.
3. Keep the effect ledger outside the blast radius: in a third zone or region, never inside the one being failed.
4. Freeze criteria first, including the latency budget for synchronous configurations.
5. Run the same boards on celld and on OpenOrange as a peer arm behind the `DurableRuntime` interface, with Rivet invited to review the configuration.

**ClawQL's own arm: durability by write class.** Alongside celld (fleet and bucket modes) and OpenOrange, run ClawQL's design (whitepaper [section 11](../vision/clawql-network-whitepaper-v0.2.md#11-clawql-cellrt-the-runtime-substrate)): effect-critical writes go through a replicated log acknowledged only after copies exist in multiple zones (NATS JetStream, three replicas, syncing to disk; in the homelab, one replica on each of the three machines), and everything else takes the batched path. Record for every arm: acknowledged writes lost per fault scope, latency added per effect-critical write, object-store requests and cross-zone bytes per agent lifecycle, behavior during partitions, and the share of writes that were effect-critical. The replicated log runs inside the boards, so its own failures count.

**Guardrails:** dedicated accounts only, never shared or production ones; budget alerts; stop conditions on every experiment; every run's scope and timing logged under the rules of engagement in the [security testing plan](../security/clawql-security-testing-plan.md).

#### Planned: reproducing Rivet's S3 request-cost benchmark

Rivet's public benchmark ([rivet-dev/celld-vs-openorange-bench](https://github.com/rivet-dev/celld-vs-openorange-bench)) compares object-store requests for celld and OpenOrange under a high-churn agent workload: 60-second agents writing every 10 seconds, request costs only, all nodes in one Azure zone. Rivet corrected the thread's three-zone wording on 2026-11-13. Reproduce it from cheapest to most faithful:

1. Recompute the cost table from the repository's raw request logs.
2. Run both fixtures in the homelab against MinIO, count PUT, GET and LIST per agent lifecycle from MinIO's metrics, and price them at S3 rates. This validates per-agent ratios (about 4 PUTs and 1 GET per new Durable Object for celld) at no cloud cost.
3. Rerun the Azure sweep with the repository's Terraform only if steps 1 and 2 disagree.
4. Add what the benchmark leaves out: replication bytes between three nodes, to estimate cross-zone transfer cost.

Also record how the benchmark's celld settings (one-second idle eviction, default fleet durability) compare with ClawQL's lab build, and measure ClawQL's own object-store requests per program and per park/wake cycle, since cell granularity is the main cost lever. Results go to Rivet privately before anything is published.

### 4.2 Security

Follow the [security testing plan](../security/clawql-security-testing-plan.md): lab first, written rules of engagement, automated scanning in CI, guarantee tests for every public claim, destructive-action tests against AWS Emulator, and on-chain tests on testnets and local forks before any real funds.

## 5. Benchmarking

- **Rules for every board:** criteria frozen before any scored run; raw artifacts published; failures published; host, build and model strings recorded; runs voided only for monitored environment faults; peer comparisons only after maintainer review.
- **Host labels:** boards name the machine that ran each component. Moving a service (for example ClawQL to the N5 Pro) starts a new labeled configuration rather than silently changing an existing board.
- **Contention:** nothing unrelated runs on a measured host during a board (for example, unload the local judge model and pause Hermes jobs).
- **Energy measurement:** idle baseline recorded with the measurement tool running; arms interleaved task by task; incremental and total energy both reported. `powermetrics` gives chip-level energy on Macs; a logging wall meter is needed for any comparison across machines.
- **Current program:** the [Harvey LAB right-sizing remeasure](../benchmarks/harvey-lab-rightsizing-remeasure-handoff.md): Nemotron with and without ClawQL against Opus with and without ClawQL, on the Mac mini first, then the 5090, with an optional routed arm.
- **Planned boards:** documents per hour and energy per document on one Mac Studio; scale-ladder milestones; durability on a second host; density with durability on.

## 6. Fine-tuning

### 6.1 Purpose

Produce fine-tuned models that complete ClawQL tool-calling workflows better and in fewer turns than their base models, and run well at 4-bit on the 64 GB Mac mini. A performant fine-tuned model on a Mac mini, at roughly a third of a Mac Studio's price and a quarter of its memory, is an easier sell to sovereign and regulated buyers than a large-model demo.

### 6.2 Base models and licenses (checked 2026-11-12)

| Model | License | Use here |
| --- | --- | --- |
| **Qwen3.8-27B** | Apache 2.0 | **Base A (dense).** Released 2026-08-14 at `Qwen/Qwen3.8-27B`. Commercial use, modification and redistribution of derived weights permitted, keeping the license and notices and without using Alibaba's trademarks. |
| **Qwen3.6-35B-A3B** | Apache 2.0 | **Base B (mixture of experts),** about 36B total with 3B active per token. |
| Qwen3.8-Flash-Next | qwen-community-1.0 (custom) | Not a base. Read the license before any commercial use. |
| Qwen3.8-2.4T-A95B (Max) | Custom Qwen3.8-Max license | Not relevant here. |
| GLM-5.3-Flash | MIT | Teacher for generating training data. |
| Qwen4 (any size) | None published | Not released as of 2026-11-10. An open-weight commitment is reported in the press but not in Alibaba's own announcements; Qwen 3.7 never received open weights; the 27B tier is expected to open first. |

**Rules:** download only from the official Qwen organization; name results as ClawQL's, for example "ClawQL Agent 27B (fine-tuned from Qwen3.8-27B)"; keep the pipeline base-agnostic so it can be rerun on Qwen4-27B if its license permits.

### 6.3 Two bases and a routed pair

|  | Base A: Qwen3.8-27B (dense) | Base B: Qwen3.6-35B-A3B (MoE) |
| --- | --- | --- |
| Starting capability | Much higher: Artificial Analysis Intelligence Index 52 versus 32 on its head-to-head comparison | Lower, and an earlier generation |
| Speed on a Mac mini | Slow: every token uses all 27B parameters | Several times faster at generating and processing prompts |
| Memory at 4-bit | About 17 GB | About 20 GB |
| Ease of fine-tuning | Straightforward | Harder: monitor expert routing and load during training |
| Room to improve on ClawQL tasks | Less | More |

**Expectation to test:** Base A wins on long multi-step workflows; fine-tuned Base B comes close on routine workflows, several times faster and with less energy per task.

**Routed pair (arm R):** both fine-tuned models fit on the Mac mini together (about 37 GB at 4-bit). A policy-routed virtual model sends routine work to Base B and hard work to Base A. The routing rule (escalation signal and threshold) is frozen before the run; results report which model answered each task and the share escalated.

### 6.4 Step 1: Freeze the evaluation

- **Success rate** on held-out workflows: pets multiturn, Cloudflare zone-audit, fan-out and join, a slice of Harvey LAB, and AWS scenarios on AWS Emulator.
- **Tool-call quality:** correct operation, schema-valid arguments, projection and the known-operation path rather than repeated search.
- **Efficiency:** turns, tokens, time to complete and energy per successful task, on the Mac mini.
- **Governance behavior:** requests approval and waits; does not follow instructions planted in tool results. The gateway still enforces all of this.
- **General ability:** a small general set to catch regressions.

**Arms**, all on the Mac mini at the shipped quantization: A0 (Base A untuned), A1 (Base A fine-tuned), B0, B1, R (routed pair), and F (a frontier reference, energy estimated or not measured). Held-out tasks and APIs never appear in training data.

### 6.5 Step 2: Build the training data

- **Clean sources only:** an open-weight teacher run locally (GLM-5.3-Flash, MIT) and the base models' own successful attempts. Many closed-model providers prohibit using their outputs to train competing models.
- **The harness is the grader:** generate many attempts per task and keep only those that pass (rejection sampling).
- **Breadth:** many OpenAPI specs plus AWS services through AWS Emulator and their Smithy models.
- **Hard cases:** blocked actions, approval waits, injected instructions, upstream errors and recovery.
- **Short reasoning on tool calls,** to keep responses fast.
- **General data mix:** roughly 10–20% general instruction data.
- **Exact production format:** the chat template, tool-call format and system prompts ClawQL and Hermes actually serve.
- **Provenance log:** source of every example (teacher, model version, task, seed), stored on the N5 Pro.

### 6.6 Step 3: Train in stages

1. Supervised fine-tuning with LoRA on a few thousand high-quality successful trajectories.
2. Preference tuning (DPO) on pass/fail pairs.
3. Reinforcement learning (GRPO) with the harness's automatic checks as the reward, only if stages 1 and 2 plateau.

Starting points to tune: LoRA rank 16–64, learning rate about 1e-4 to 2e-4, 1–3 epochs. Checkpoints go to the MS-A2's NVMe scratch; finished adapters are archived on the N5 Pro.

### 6.7 Step 4: Quantize, then evaluate on the Mac mini

For each base, merge the adapter, quantize to 4-bit for MLX, and only then run the frozen evaluation on the Mac mini. For arm R, load both models at once and confirm there is no swapping at the evaluation's longest contexts. Results measured before quantization do not count; if gains drop, try distillation-based quantization methods.

### 6.8 Step 5: Publish

All arms on the held-out tasks, with success, turns, tokens, time and energy per successful task on the Mac mini, linked to the frozen criteria and raw results.

### 6.9 Model card

Base model and license with upstream notices; training data sources, teachers and their licenses, and exclusions; evaluation at the shipped quantization, with hardware; known limitations, and that the gateway, not the model, enforces governance.

## 7. Open items

- [ ] Freeze the fine-tuning evaluation, hypotheses and the arm R routing rule.
- [ ] Choose training stacks on the 5090 and the Studio; confirm MoE fine-tuning support for Qwen3.6-35B-A3B.
- [ ] Confirm the teacher setup on the Studio and the rollout setup on the 5090.
- [ ] Decide what ships if arms disagree: the single best model, or the routed pair.
- [ ] Name the fine-tuned models.
- [ ] Re-check Qwen4's license on the day it is released.
- [ ] Get logging wall meters for the Mac mini and the 5090 host.
- [ ] Complete the ClawQL migration checklist and the items to verify (sections 3.2 and 3.4).
