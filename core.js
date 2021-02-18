/**
 ** (C) Copyright 2021 Derrell Lipman
 ** All Rights Reserved
 **
 **   License:
 **     MIT: https://opensource.org/licenses/MIT
 **     See the LICENSE file in the project's top-level directory for details.
 **
 ** Author: Derrell Lipman
 */

'use strict';

/*
 * See https://www.kernel.org/doc/html/latest/networking/statistics.html
 */

let             pciIds;          // PCI ID database parsed into a map
let             ifIndexMap = {}; // keyed by interface name
let             nextIfIndex = 1; // unique value in ifIndexMap
const           fsp = require("fs").promises;

class SnmpLinuxLib
{
  cache = {};
  pciIdPath = null;

  constructor(
    sysDescr,
    sysObjectID,
    sysContact,
    sysName,
    sysLocation,
    sysServices,
    pciIdPath = "/usr/share/misc/pci.ids")
  {
    // Save the path to the PCI ID database
    this.pciIdPath = pciIdPath;

    // Start the clock, for sysUpTime calls
    this.cache.startTime = new Date();

    // Save user-provided values
    this.cache.sysDescr = sysDescr;
    this.cache.sysObjectID = sysObjectID;
    this.cache.sysContact = sysContact;
    this.cache.sysName = sysName;
    this.cache.sysLocation = sysLocation;
    this.cache.sysServices = sysServices;
  }

  /**
   * Waiting on init() to complete allows parsing the PCI ID database only
   * once.
   */
  async init()
  {
    // If we don't yet have the PCI database parsed, do it now.
    if (! pciIds)
    {
      pciIds = await require("./parsePciIds")(this.pciIdPath);
    }
  }

  /*
   * *********************************************************************
   * the System group
   *
   * Implementation of the System group is mandatory for all systems. If an
   * agent is not configured to have a value for any of these variables, a
   * string of length 0 is returned.
   * *********************************************************************
   */

  /**
   * A textual description of the entity. This value should include the full
   * name and version identification of the system's hardware type, software
   * operating-system, and networking software. It is mandatory that this only
   * contain printable ASCII characters.
   */
  async getSysDescr()
  {
    return this.cache.sysDescr;
  }

  /**
   * The vendor's authoritative identification of the network management
   * subsystem contained in the entity. This value is allocated within the SMI
   * enterprises subtree (1.3.6.1.4.1) and provides an easy and unambiguous
   * means for determining `what kind of box' is being managed. For example,
   * if vendor `Flintstones, Inc.' was assigned the subtree 1.3.6.1.4.1.4242,
   * it could assign the identifier 1.3.6.1.4.1.4242.1.1 to its `Fred Router'.
   */
  async getSysObjectID()
  {
    return this.cache.sysObjectID;
  }

  /**
   * The time (in hundredths of a second) since the network management portion
   * of the system was last re-initialized.
   */
  async getSysUpTime()
  {
    return ((new Date()).getTime() - this.cache.startTime.getTime()) / 10;
  }

  /**
   * The textual identification of the contact person for this managed node,
   * together with information on how to contact this person.
   */
  async getSysContact()
  {
    return this.cache.sysContact;
  }
  async setSysContact(value)
  {
    this.cache.sysContact = value;
  }

  /**
   * An administratively-assigned name for this managed node. By convention,
   * this is the node's fully-qualified domain name.
   */
  async getSysName()
  {
    return this.cache.sysName;
  }
  async setSysName(value)
  {
    this.cache.sysName = value;
  }

  /**
   * The physical location of this node (e.g., `telephone closet, 3rd
   * floor').
   */
  async getSysLocation()
  {
    return this.cache.sysLocation;
  }
  async setSysLocation(value)
  {
    this.cache.sysLocation = value;
  }

  /**
   * A value which indicates the set of services that this entity primarily
   * offers.
   *
   * The value is a sum. This sum initially takes the value zero, Then, for
   * each layer, L, in the range 1 through 7, that this node performs
   * transactions for, 2 raised to (L - 1) is added to the sum. For example, a
   * node which performs primarily routing functions would have a value of 4
   * (2^(3-1)). In contrast, a node which is a host offering application
   * services would have a value of 72 (2^(4-1) + 2^(7-1)). Note that in the
   * context of the Internet suite of protocols, values should be calculated
   * accordingly:
   *
   *      layer  functionality
   *          1  physical (e.g., repeaters)
   *          2  datalink/subnetwork (e.g., bridges)
   *          3  internet (e.g., IP gateways)
   *          4  end-to-end  (e.g., IP hosts)
   *          7  applications (e.g., mail relays)
   *
   * For systems including OSI protocols, layers 5 and 6 may also be counted.
   */
  async getSysServices()
  {
    return this.cache.sysServices;
  }


  /*
   * *********************************************************************
   * the Interfaces group
   *
   * Implementation of the Interfaces group is mandatory for all systems.
   * *********************************************************************
   */

  /**
   * The number of network interfaces (regardless of their current state)
   * present on this system.
   */
  async getIfNumber()
  {
    return Promise.resolve()
      .then(() => addIfIndexes())
      .then((ifNames) => ifNames.length);
  }

  /**
   * A list of interface entries. The number of entries is given by the value
   * of ifNumber.
   */
  async getIfTable()
  {
    // If we don't yet have the PCI database parsed, do it now.
    if (! pciIds)
    {
      pciIds = await require("./parsePciIds")(this.pciIdPath);
    }

    return Promise.resolve()
      .then(() => addIfIndexes())
      .then((ifNames) =>
        {
          return Promise.all(
            ifNames.map((ifName) =>
              this.getIfEntry(ifName, ifIndexMap[ifName])));
        });
  }

  /**
   * An interface entry containing objects at the subnetwork layer and below
   * for a particular interface.
   */
  async getIfEntry(ifName, index)
  {
    /*
     * A unique value for each interface. Its value ranges between 1 and the
     * value of ifNumber. The value for each interface must remain constant at
     * least from one re-initialization of the entity's network management
     * system to the next re- initialization.
     */
    let             ifIndex             = async () =>
    {
      // Have we already identified this interface index?
      if (ifName in ifIndexMap)
      {
        // Yup. We can return it immediately.
        return ifIndexMap[ifName];
      }

      // We need to enumerate all interfaces and get this one's index.
      return Promise.resolve()
        .then(() => addIfIndexes())
        .then(() =>
          {
            // It'd better be there now
            if (! (ifName in ifIndexMap))
            {
              throw new Error(`Interface ${ifName} does not exist`);
            }

            return ifIndexMap[ifName];
          });
    };

    /*
     * A textual string containing information about the interface. This
     * string should include the name of the manufacturer, the product name
     * and the version of the hardware interface.
     */
    let             ifDescr             = async () =>
    {
      let             vendor;
      let             device;
      let             revision;

      // If we don't yet have the PCI database parsed, do it now.
      if (! pciIds)
      {
        pciIds = await require("./parsePciIds")(this.pciIdPath);
      }

      return Promise.allSettled(
        [
          fsp.readFile(`/sys/class/net/${ifName}/device/vendor`),
          fsp.readFile(`/sys/class/net/${ifName}/device/device`),
          fsp.readFile(`/sys/class/net/${ifName}/device/revision`)
        ])
        .then(
          (results) =>
          {
            let             manufacturer;
            let             deviceName;
            let             getValueOrUnknown =
                () =>
                {
                  const           result = results.shift();

                  if (result.status == "fulfilled")
                  {
                    return result.value.toString().trim();
                  }

                  return "Unknown";
                };

            // Get the vendor ID, deviceID, and revision. Attempt to
            // convert vendor ID and device ID into their respective
            // manufacturer and device name, if that information is
            // available to us.
            vendor = manufacturer = getValueOrUnknown().replace("0x", "");
            try { manufacturer = pciIds[vendor].manufacturer; } catch (e) {};
            device = deviceName = getValueOrUnknown().replace("0x", "");
            try { deviceName = pciIds[vendor].devices[device]; } catch (e) {};
            revision = getValueOrUnknown();

            return (
              [
                `Vendor: ${manufacturer}`,
                `Device: ${deviceName}`,
                `Rev : ${revision}`
              ].join(" | "));
          });
    };

    /*
     * The type of interface, distinguished according to the physical/link
     * protocol(s) immediately `below' the network layer in the protocol
     * stack.
     */
    let             ifType              = async () =>
    {
      const           definedTypes =
            {
              other                     : 1, // none of the following
              regular1822               : 2,
              hdh1822                   : 3,
              ddn_x25                   : 4,
              rfc877_x25                : 5,
              ethernet_csmacd           : 6,
              iso88023_csmacd           : 7,
              iso88024_tokenBus         : 8,
              iso88025_tokenRing        : 9,
              iso88026_man              : 10,
              starLan                   : 11,
              proteon_10Mbit            : 12,
              proteon_80Mbit            : 13,
              hyperchannel              : 14,
              fddi                      : 15,
              lapb                      : 16,
              sdlc                      : 17,
              ds1                       : 18, // T-1
              e1                        : 19, // european equiv. of T-1
              basicISDN                 : 20,
              primaryISDN               : 21, // proprietary serial
              propPointToPointSerial    : 22,
              ppp                       : 23,
              softwareLoopback          : 24,
              eon                       : 25, // CLNP over IP [11]
              ethernet_3Mbit            : 26,
              nsip                      : 27, // XNS over IP
              slip                      : 28, // generic SLIP
              ultra                     : 29, // ULTRA technologies
              ds3                       : 30, // T-3
              sip                       : 31, // SMDS
              frame_relay               : 32
            };

      // TODO: don't know how to figure this out
      return definedTypes.other;
    };

    /*
     * The size of the largest datagram which can be sent/received on the
     * interface, specified in octets. For interfaces that are used for
     * transmitting network datagrams, this is the size of the largest network
     * datagram that can be sent on the interface.
     */
    let             ifMtu               = async () =>
    {
      return Promise.resolve()
        .then(() => fsp.readFile(`/sys/class/net/${ifName}/mtu`))
        .then(v => +v.toString().trim());
    };

    /*
     * An estimate of the interface's current bandwidth in bits per second.
     * For interfaces which do not vary in bandwidth or for those where no
     * accurate estimation can be made, this object should contain the nominal
     * bandwidth.
     */
    let             ifSpeed             = async () =>
    {
      let             speed;

      return Promise.resolve()
        .then(() => fsp.readFile(`/sys/class/net/${ifName}/speed`))
        .then(v => speed = +v.toString().trim())
        .catch((e) => speed = 100) // in case it's not available
        .then(() => speed);
    };

    /*
     * The interface's address at the protocol layer immediately `below' the
     * network layer in the protocol stack. For interfaces which do not have
     * such an address (e.g., a serial line), this object should contain an
     * octet string of zero length.
     */
    let             ifPhysAddress       = async () =>
    {
      return Promise.resolve()
        .then(() => fsp.readFile(`/sys/class/net/${ifName}/address`))
        .then(v => v.toString().trim());
    };

    /*
     * The desired state of the interface. The testing(3) state indicates that
     * no operational packets can be passed.
     */
    let             ifAdminStatus       = async () =>
    {
      return 1;                 // 1=up 2=down 3=testing
    };

    /*
     * The current operational state of the interface. The testing(3) state
     * indicates that no operational packets can be passed.
     */
    let             ifOperStatus        = async () =>
    {
      return Promise.resolve()
        .then(() => fsp.readFile(`/sys/class/net/${ifName}/operstate`))
        .then(v => v.toString().trim())
        .then(v => v.toLowerCase() == "up" ? 1 : 2); // 1=up 2=down 3=testing
    };

    /*
     * The value of sysUpTime at the time the interface entered its current
     * operational state. If the current state was entered prior to the last
     * re- initialization of the local network management subsystem, then this
     * object contains a zero value.
     */
    let             ifLastChange        = async () =>
    {
      return 0; // Assume interface came up before management system
    };

    /*
     * The total number of octets received on the interface, including
     * framing characters.
     */
    let             ifInOctets          = async () =>
    {
      return Promise.resolve()
        .then(() =>
          fsp.readFile(`/sys/class/net/${ifName}/statistics/rx_bytes`))
        .then(v => +v.toString().trim());
    };

    /*
     * The number of subnetwork-unicast packets delivered to a higher-layer
     * protocol.
     */
    let             ifInUcastPkts       = async () =>
    {
      return Promise.all(
        [
          fsp.readFile(`/sys/class/net/${ifName}/statistics/rx_packets`),
          fsp.readFile(`/sys/class/net/${ifName}/statistics/multicast`),
        ])
        .then(
          (results) =>
          {
            let             rx_packets = +results.shift().toString().trim();
            let             multicast  = +results.shift().toString().trim();

            return rx_packets - multicast;
          });
    };

    /*
     * The number of non-unicast (i.e., subnetwork- broadcast or
     * subnetwork-multicast) packets delivered to a higher-layer protocol.
     */
    let             ifInNUcastPkts      = async () =>
    {
      return Promise.resolve()
        .then(() =>
          fsp.readFile(`/sys/class/net/${ifName}/statistics/multicast`))
        .then(v => +v.toString().trim());
    };

    /*
     * The number of inbound packets which were chosen to be discarded even
     * though no errors had been detected to prevent their being deliverable
     * to a higher-layer protocol. One possible reason for discarding such a
     * packet could be to free up buffer space.
     */
    let             ifInDiscards        = async () =>
    {
      return Promise.all(
        [
          fsp.readFile(`/sys/class/net/${ifName}/statistics/rx_dropped`),
          fsp.readFile(`/sys/class/net/${ifName}/statistics/rx_missed_errors`),
        ])
        .then(
          (results) =>
          {
            let         rx_dropped = +results.shift().toString().trim();
            let         rx_missed_errors  = +results.shift().toString().trim();

            return rx_dropped + rx_missed_errors;
          });
    };

    /*
     * The number of inbound packets that contained errors preventing them
     * from being deliverable to a higher-layer protocol.
     */
    let             ifInErrors          = async () =>
    {
      return Promise.resolve()
        .then(() =>
          fsp.readFile(`/sys/class/net/${ifName}/statistics/rx_errors`))
        .then(v => +v.toString().trim());
    };

    /*
     * The number of packets received via the interface which were discarded
     * because of an unknown or unsupported protocol.
     */
    let             ifInUnknownProtos   = async () =>
    {
      return Promise.resolve()
        .then(() =>
          fsp.readFile(`/sys/class/net/${ifName}/statistics/rx_dropped`))
        .then(v => +v.toString().trim());
    };

    /*
     * The total number of octets transmitted out of the interface, including
     * framing characters.
     */
    let             ifOutOctets         = async () =>
    {
      return Promise.resolve()
        .then(() =>
          fsp.readFile(`/sys/class/net/${ifName}/statistics/tx_bytes`))
        .then(v => +v.toString().trim());
    };

    /*
     * The total number of packets that higher-level protocols requested be
     * transmitted to a subnetwork-unicast address, including those that were
     * discarded or not sent.
     */
    let             ifOutUcastPkts       = async () =>
    {
      return Promise.resolve()
        .then(() =>
          fsp.readFile(`/sys/class/net/${ifName}/statistics/tx_packets`))
        .then(v => +v.toString().trim());
    };

    /*
     * The total number of packets that higher-level protocols requested be
     * transmitted to a non- unicast (i.e., a subnetwork-broadcast or
     * subnetwork-multicast) address, including those that were discarded or
     * not sent.
     */
    let             ifOutNUcastPkts     = async () =>
    {
      return 0;                 // TODO: Is this number available anyplace?
    };

    /*
     * The number of outbound packets which were chosen to be discarded even
     * though no errors had been detected to prevent their being transmitted.
     * One possible reason for discarding such a packet could be to free up
     * buffer space.
     */
    let             ifOutDiscards       = async () =>
    {
      return Promise.resolve()
        .then(() =>
          fsp.readFile(`/sys/class/net/${ifName}/statistics/tx_dropped`))
        .then(v => +v.toString().trim());
    };

    /*
     * The number of outbound packets that could not be transmitted because of
     * errors.
     */
    let             ifOutErrors         = async () =>
    {
      return Promise.resolve()
        .then(() =>
          fsp.readFile(`/sys/class/net/${ifName}/statistics/tx_errors`))
        .then(v => +v.toString().trim());
    };

    /*
     * The length of the output packet queue (in packets).
     */
    let             ifOutQLen           = async () =>
    {
      return Promise.resolve()
        .then(() =>
          fsp.readFile(`/sys/class/net/${ifName}/tx_queue_len`))
        .then(v => +v.toString().trim());
    };

    let             ifSpecific          = async () =>
    {
      return "0.0";
    };


    return Promise.all(
      [
        ifIndex(),
        ifDescr(),
        ifType(),
        ifMtu(),
        ifSpeed(),
        ifPhysAddress(),
        ifAdminStatus(),
        ifOperStatus(),
        ifLastChange(),
        ifInOctets(),
        ifInUcastPkts(),
        ifInNUcastPkts(),
        ifInDiscards(),
        ifInErrors(),
        ifInUnknownProtos(),
        ifOutOctets(),
        ifOutUcastPkts(),
        ifOutNUcastPkts(),
        ifOutDiscards(),
        ifOutErrors(),
        ifOutQLen(),
        ifSpecific()
      ])
      .then((results) =>
        {
          let result =
            {
              ifIndex           : results.shift(),
              ifDescr           : results.shift(),
              ifType            : results.shift(),
              ifMtu             : results.shift(),
              ifSpeed           : results.shift(),
              ifPhysAddress     : results.shift(),
              ifAdminStatus     : results.shift(),
              ifOperStatus      : results.shift(),
              ifLastChange      : results.shift(),
              ifInOctets        : results.shift(),
              ifInUcastPkts     : results.shift(),
              ifInNUcastPkts    : results.shift(),
              ifInDiscards      : results.shift(),
              ifInErrors        : results.shift(),
              ifInUnknownProtos : results.shift(),
              ifOutOctets       : results.shift(),
              ifOutUcastPkts    : results.shift(),
              ifOutNUcastPkts   : results.shift(),
              ifOutDiscards     : results.shift(),
              ifOutErrors       : results.shift(),
              ifOutQLen         : results.shift(),
              ifSpecific        : results.shift()
            };

          return result;
        });
  }


  /*
   * **********************************************************************
   * the Address Translation group
   *
   * DEPRECATED AND NOT IMPLEMENTED HERE.
   *
   * Implementation of the Address Translation group is mandatory for all
   * systems. Note however that this group is deprecated by MIB-II. That is,
   * it is being included solely for compatibility with MIB-I nodes, and will
   * most likely be excluded from MIB-III nodes. From MIB-II and onwards, each
   * network protocol group contains its own address translation tables.
   *
   * The Address Translation group contains one table which is the union
   * across all interfaces of the translation tables for converting a
   * NetworkAddress (e.g., an IP address) into a subnetwork-specific address.
   * For lack of a better term, this document refers to such a
   * subnetwork-specific address as a `physical' address.
   *
   * Examples of such translation tables are: for broadcast media where ARP is
   * in use, the translation table is equivalent to the ARP cache; or, on an
   * X.25 network where non-algorithmic translation to X.121 addresses is
   * required, the translation table contains the NetworkAddress to X.121
   * address equivalences.
   * **********************************************************************
   */

  // async getAtTable() {}
  // async getAtEntry() {}
  // async getAtIfIndex() {}
  // async getAtPhysAddress() {}
  // async getAtNetAddress() {}



  /*
   * *********************************************************************
   * the IP group
   *
   * Implementation of the IP group is mandatory for all systems.
   * *********************************************************************
   */

  /*
   * The indication of whether this entity is acting as an IP gateway in
   * respect to the forwarding of datagrams received by, but not addressed to,
   * this entity. IP gateways forward datagrams. IP hosts do not (except those
   * source-routed via the host).
   *
   * Note that for some managed nodes, this object may take on only a subset
   * of the values possible. Accordingly, it is appropriate for an agent to
   * return a `badValue' response if a management station attempts to change
   * this object to an inappropriate value.
   */
  async getIpForwarding()
  {
    return Promise.resolve()
      .then(() => fsp.readFile("/proc/sys/net/ipv4/ip_forward"))
      .then(v => +v.toString().trim()) // file: 1=forwarding, 0=not-forwarding
      .then(v => v ? 1 : 2);           // ret:  1=forwarding, 2=not-forwarding
  }

  /*
   * The default value inserted into the Time-To-Live field of the IP header
   * of datagrams originated at this entity, whenever a TTL value is not
   * supplied by the transport layer protocol.
   */
  async getIpDefaultTTL()
  {
    return Promise.resolve()
      .then(() => fsp.readFile("/proc/sys/net/ipv4/ip_default_ttl"))
      .then(v => +v.toString().trim());
  }

  /*
   * Retrieve all information available from /proc/net/snmp
   */
  async getNetSnmpInfo()
  {
    let             heading;
    let             fieldNames;
    let             info = {};
    let             bDefinition = true;

    return Promise.resolve()
      .then(() => fsp.readFile("/proc/net/snmp"))
      .then((content) => content.toString().split("\n"))
      .then(
        (lines) =>
        {
          lines.forEach(
            (line) =>
            {
              let             thisHeading;
              let             fieldValues;

              // An empty line signifies the end
              line = line.trim();
              if (line.length === 0)
              {
                return;
              }

              // A definition line looks like:
              // Ip: Forwarding DefaultTTL InReceives ...
              //
              // A value line looks like:
              // Ip: 1 64 87367079 ...
              if (bDefinition)
              {
                [ heading, fieldNames ] = line.split(/: */);
                fieldNames = fieldNames.split(" ");
              }
              else
              {
                [ thisHeading, fieldValues ] = line.split(/: */);

                // We expect this heading to be the same as the one in
                // the definition.
                if (thisHeading != heading)
                {
                  throw new Error(
                    `Unexpected heading ${thisHeading}; expected ${heading}`);
                }

                fieldValues = fieldValues.split(" ");

                // We expect the number of fieldValues to match the
                // number of fieldNames
                if (fieldValues.length != fieldNames.length)
                {
                  throw new Error(
                    [
                      "Number of field names in ",
                      JSON.stringify(fieldNames),
                      " does not match number of values in ",
                      JSON.stringify(fieldValues)
                    ].join(""));
                }

                // Fill in the info map for this heading
                info[heading] = {};
                fieldNames.forEach(
                  (name, i) =>
                  {
                    info[heading][name] = fieldValues[i];
                  });
              }

              bDefinition = ! bDefinition;
            });

          return info;
        });
  }


  /*
   * The total number of input datagrams received from interfaces, including
   * those received in error.
   */
  async getIpInReceives()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Ip.InReceives);
  }

  /*
   * The number of input datagrams discarded due to errors in their IP
   * headers, including bad checksums, version number mismatch, other format
   * errors, time-to-live exceeded, errors discovered in processing their IP
   * options, etc.
   */
  async getIpInHdrErrors()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Ip.InHdrErrors);
  }

  /*
   * The number of input datagrams discarded because the IP address in their
   * IP header's destination field was not a valid address to be received at
   * this entity. This count includes invalid addresses (e.g., 0.0.0.0) and
   * addresses of unsupported Classes (e.g., Class E). For entities which are
   * not IP Gateways and therefore do not forward datagrams, this counter
   * includes datagrams discarded because the destination address was not a
   * local address.
   */
  async getIpInAddrErrors()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Ip.InAddrErrors);
  }

  /*
   * The number of input datagrams for which this entity was not their final
   * IP destination, as a result of which an attempt was made to find a route
   * to forward them to that final destination. In entities which do not act
   * as IP Gateways, this counter will include only those packets which were
   * Source-Routed via this entity, and the Source- Route option processing
   * was successful.
   */
  async getIpForwDatagrams()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Ip.ForwDatagrams);
  }

  /*
   * The number of locally-addressed datagrams received successfully but
   * discarded because of an unknown or unsupported protocol.
   */
  async getIpInUnknownProtos()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Ip.InUnknownProtos);
  }

  /*
   * The number of input IP datagrams for which no problems were encountered
   * to prevent their continued processing, but which were discarded (e.g.,
   * for lack of buffer space). Note that this counter does not include any
   * datagrams discarded while awaiting re-assembly.
   */
  async getIpInDiscards()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Ip.InDiscards);
  }

  /*
   * The total number of input datagrams successfully delivered to IP
   * user-protocols (including ICMP).
   */
  async getIpInDelivers()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Ip.InDelivers);
  }

  /*
   * The total number of IP datagrams which local IP user-protocols (including
   * ICMP) supplied to IP in requests for transmission. Note that this counter
   * does not include any datagrams counted in ipForwDatagrams.
   */
  async getIpOutRequests()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Ip.OutRequests);
  }

  /*
   * The number of output IP datagrams for which no problem was encountered to
   * prevent their transmission to their destination, but which were discarded
   * (e.g., for lack of buffer space). Note that this counter would include
   * datagrams counted in ipForwDatagrams if any such packets met this
   * (discretionary) discard criterion.
   */
  async getIpOutDiscards()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Ip.OutDiscards);
  }

  /*
   * The number of IP datagrams discarded because no route could be found to
   * transmit them to their destination. Note that this counter includes any
   * packets counted in ipForwDatagrams which meet this `no-route' criterion.
   * Note that this includes any datagarms which a host cannot route because
   * all of its default gateways are down.
   */
  async getIpOutNoRoutes()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Ip.OutNoRoutes);
  }

  /*
   * The maximum number of seconds which received fragments are held while
   * they are awaiting reassembly at this entity.
   */
  async getIpReasmTimeout()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Ip.ReasmTimeout);
  }

  /*
   * The number of IP fragments received which needed to be reassembled at
   * this entity.
   */
  async getIpReasmReqds()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Ip.ReasmReqds);
  }

  /*
   * The number of IP datagrams successfully re- assembled.
   */
  async getIpReasmOKs()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Ip.ReasmOKs);
  }

  /*
   * The number of failures detected by the IP re- assembly algorithm (for
   * whatever reason: timed out, errors, etc). Note that this is not
   * necessarily a count of discarded IP fragments since some algorithms
   * (notably the algorithm in RFC 815) can lose track of the number of
   * fragments by combining them as they are received.
   */
  async getIpReasmFails()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Ip.ReasmFails);
  }

  /*
   * The number of IP datagrams that have been successfully fragmented at this
   * entity.
   */
  async getIpFragOKs()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Ip.FragOKs);
  }

  /*
   * The number of IP datagrams that have been discarded because they needed
   * to be fragmented at this entity but could not be, e.g., because their
   * Don't Fragment flag was set.
   */
  async getIpFragFails()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Ip.FragFails);
  }

  /*
   * The number of IP datagram fragments that have been generated as a result
   * of fragmentation at this entity.
   */
  async getIpFragCreates()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Ip.FragCreates);
  }


  /*
   * **********************************************************************
   * the IP address table
   *
   * The IP address table contains this entity's IP addressing information.
   * **********************************************************************
   */

  /*
   * The table of addressing information relevant to this entity's IP
   * addresses.
   */
  async getIpAddrTable()
  {
    const           addressInfo = await getAddressInfo();
    const           byIpAddr = addressInfo.byIpAddr;

    return Promise.resolve()
      .then(
        () =>
        {
          let             ipAddr;
          let             promises = [];

          // Call `getIpAddrEntry` for each IPv4 address, binding the
          // just-retrieved addressInfo so that `getIpAddrEntry` need
          // not re-retrieve it.
          for (ipAddr in byIpAddr.IPv4)
          {
            promises.push(this.getIpAddrEntry.bind(addressInfo)(ipAddr));
          }

          return Promise.all(promises);
        });
  }

  /*
   * The addressing information for one of this entity's IP addresses.
   */
  async getIpAddrEntry(ipAddr)
  {
    let             entry;
    let             addressInfo;

    // If we were called externally, `this` will be our class. If we
    // were called from `getIpAddrTable`, above, `this` will be the
    // already-ascertained address information. If the address info is
    // already available, we save ourselves a library call for each
    // entry.
    if (this instanceof SnmpLinuxLib)
    {
      addressInfo = await getAddressInfo();
    }
    else
    {
      addressInfo = this; // already have addressInfo from getIpAddrTable
    }

    // Get the information about this address
    entry = addressInfo.byIpAddr.IPv4[ipAddr];

    /*
     * The IP address to which this entry's addressing information pertains.
     */
    let             ipAdEntAddr = async () =>
    {
      return ipAddr;
    };

    /*
     * The index value which uniquely identifies the interface to which this
     * entry is applicable. The interface identified by a particular value of
     * this index is the same interface as identified by the same value of
     * ifIndex.
     */
    let             ipAdEntIfIndex = async () =>
    {
      return Promise.resolve()
        .then(() => addIfIndexes())
        .then(() =>
          {
            // It'd better be there now
            if (! (entry.interface in ifIndexMap))
            {
              throw new Error(`Interface ${entry.interface} does not exist`);
            }

            return ifIndexMap[entry.interface];
          });
    };

    /*
     * The subnet mask associated with the IP address of this entry. The value
     * of the mask is an IP address with all the network bits set to 1 and all
     * the hosts bits set to 0.
     */
    let             ipAdEntNetMask = async () =>
    {
      return entry.netmask;
    };

    /*
     * The value of the least-significant bit in the IP broadcast address used
     * for sending datagrams on the (logical) interface associated with the IP
     * address of this entry. For example, when the Internet standard all-ones
     * broadcast address is used, the value will be 1. This value applies to
     * both the subnet and network broadcasts addresses used by the entity on
     * this (logical) interface.
     */
    let             ipAdEntBcastAddr = async () =>
    {
      let             i;
      let             octet;
      let             bits = [];
      let             cidr = entry.cidr;
      let             [ ip, netmask ] = cidr.split("/");

      // Split the IP address apart at dots
      ip = ip.split(".");

      // For each component of the IP address...
      ip.forEach(
        (octet) =>
        {
          // convert it to binary, left-pad with zeros, take
          // right-most 8 characters
          bits.push(("00000000" + (+octet).toString(2)).substr(-8));
        });

      // Get a single cohesive bitstring
      bits = bits.join("");

      // Make our life easy by separating it into one character per
      // array element
      bits = bits.split("");

      // Set the netmask-indicated bits to 1
      for (i = netmask; i < 32; i++)
      {
        bits[i] = "1";
      }

      // Rejoin the bits into a cohesive string
      bits = bits.join("");

      // Split the bits apart at 8-bit boundaries. Convert each set of
      // 8 bits to an integer.
      ip = [];
      for (i = 0; i < 32; i += 8)
      {
        octet = bits.substr(i, 8);
        octet = parseInt(octet, 2);
        ip.push(octet);
      }

      // Turn it back into IP address string format
      return ip.join(".");
    };

    /*
     * The size of the largest IP datagram which this entity can re-assemble
     * from incoming IP fragmented datagrams received on this interface.
     */
    let             ipAdEntReasmMaxSize = async () =>
    {
    };

    return Promise.all(
      [
        ipAdEntAddr(),
        ipAdEntIfIndex(),
        ipAdEntNetMask(),
        ipAdEntBcastAddr(),
        ipAdEntReasmMaxSize()
      ])
      .then((results) =>
        {
          let result =
            {
              ipAdEntAddr         : results.shift(),
              ipAdEntIfIndex      : results.shift(),
              ipAdEntNetMask      : results.shift(),
              ipAdEntBcastAddr    : results.shift(),
              ipAdEntReasmMaxSize : results.shift()
            };

          return result;
        });
  }

  /*
   * **********************************************************************
   * the IP routing table
   *
   * The IP routing table contains an entry for each route
   * presently known to this entity.
   * **********************************************************************
   */

  /*
   * This entity's IP Routing table. Each element of the returned
   * array contains the following members:
   *
   * destination (maps to ipRouteDest)
   *   The destination IP address of this route. An entry with a value of
   *   0.0.0.0 is considered a default route. Multiple routes to a single
   *   destination can appear in the table, but access to such multiple
   *   entries is dependent on the table- access mechanisms defined by the
   *   network management protocol in use.
   *
   * interface
   *   The name which uniquely identifies the local interface through which
   *   the next hop of this route should be reached.
   *
   * interfaceIndex (maps to ipRouteIfIndex)
   *   The index value which uniquely identifies the local interface through
   *   which the next hop of this route should be reached. The interface
   *   identified by a particular value of this index is the same interface as
   *   identified by the same value of ifIndex.
   *
   * metric (maps to ipRouteMetric1)
   *   The primary routing metric for this route. The semantics of this metric
   *   are determined by the routing-protocol specified in the route's
   *   ipRouteProto value. If this metric is not used, its value should be set
   *   to -1.
   *
   * gateway (maps to ipRouteNextHop)
   *   The IP address of the next hop of this route. (In the case of a route
   *   bound to an interface which is realized via a broadcast media, the
   *   value of this field is the agent's IP address on that interface.)
   *
   * flags
   *   Bit fields with the meanings shown in `IpRouteTable_FLAGS`
   *
   * mask
   *   Indicate the mask to be logical-ANDed with the destination address
   *   before being compared to the value in the destination field. For those
   *   systems that do not support arbitrary subnet masks, an agent constructs
   *   the value of the mask by determining whether the value of the
   *   correspondent destination field belong to a class-A, B, or C network,
   *   and then using one of:
   *
   *        mask           network
   *        255.0.0.0      class-A
   *        255.255.0.0    class-B
   *        255.255.255.0  class-C
   *
   *   If the value of the destination is 0.0.0.0 (a default route), then the
   *   mask value is also 0.0.0.0. It should be noted that all IP routing
   *   subsystems implicitly use this mechanism.
   *
   * -------------------------------------------------------------------------
   *
   * No mapping for ipRouteType
   *   The type of route. Note that the values direct(3) and indirect(4) refer
   *   to the notion of direct and indirect routing in the IP architecture.
   *
   *   Setting this object to the value invalid(2) has the effect of
   *   invalidating the corresponding entry in the ipRouteTable object. That
   *   is, it effectively dissasociates the destination identified with said
   *   entry from the route identified with said entry. It is an
   *   implementation-specific matter as to whether the agent removes an
   *   invalidated entry from the table. Accordingly, management stations must
   *   be prepared to receive tabular information from agents that corresponds
   *   to entries not currently in use. Proper interpretation of such entries
   *   requires examination of the relevant ipRouteType object.
   *
   * No mapping for ipRouteProto
   *   The routing mechanism via which this route was learned. Inclusion of
   *   values for gateway routing protocols is not intended to imply that
   *   hosts should support those protocols.
   *
   * No mapping for ipRouteAge
   *   The number of seconds since this route was last updated or otherwise
   *   determined to be correct. Note that no semantics of `too old' can be
   *   implied except through knowledge of the routing protocol by which the
   *   route was learned.
   */
  async getIpRouteTable()
  {
    return Promise.resolve()
      .then(() => getRouteInfo4())
      .then(
        (routeInfo) =>
        {
          return routeInfo;
        });
  }

  /* Flag bits for the `flags` field returned in `getIpRouteTable` entries */
  IpRouteTable_FLAGS =
    {
      Up        : 0x0001,          // route usable
      Gateway   : 0x0002,          // destination is a gateway
      Host      : 0x0004,          // host entry (net otherwise)
      Reinstate : 0x0008,          // reinstate route after tmout
      Dynamic   : 0x0010,          // created dyn. (by redirect)
      Modified  : 0x0020,          // modified dyn. (by redirect)
      Mtu       : 0x0040,          // specific MTU for this route
      Window    : 0x0080,          // per route window clamping
      Irtt      : 0x0100,          // Initial round trip time
      Reject    : 0x0200,          // Reject route
      Notcached : 0x0400           // this route isn't cached
    };

  /*
   * The IP Address Translation table used for mapping from IP addresses to
   * physical addresses.
   */
  async getIpNetToMediaTable()
  {
    const           addressInfo = await getAddressInfo();
    const           byHwAddr = addressInfo.byHwAddr;

    return Promise.resolve()
      .then(
        () =>
        {
          let             hwAddr;
          let             promises = [];

          // Call `getIpNetToMediaEntry` for each hardware address,
          // binding the just-retrieved addressInfo so that
          // `getIpAddrEntry` need not re-retrieve it.
          for (hwAddr in byHwAddr.IPv4)
          {
            promises.push(this.getIpNetToMediaEntry.bind(addressInfo)(hwAddr));
          }

          return Promise.all(promises);
        });
  }

  /*
   * Each entry contains one IpAddress to `physical' address equivalence.
   */
  async getIpNetToMediaEntry(hwAddr)
  {
    let             entry;
    let             addressInfo;

    // If we were called externally, `this` will be our class. If we
    // were called from `getIpAddrTable`, above, `this` will be the
    // already-ascertained address information. If the address info is
    // already available, we save ourselves a library call for each
    // entry.
    if (this instanceof SnmpLinuxLib)
    {
      addressInfo = await getAddressInfo();
    }
    else
    {
      addressInfo = this; // already have addressInfo from getIpAddrTable
    }

    // Get the information about this address
    entry = addressInfo.byHwAddr.IPv4[hwAddr];

    /*
     * The interface on which this entry's equivalence is effective. The
     * interface identified by a particular value of this index is the same
     * interface as identified by the same value of ifIndex.
     */
    let             ipNetToMediaIfIndex = async () =>
    {
      return Promise.resolve()
        .then(() => addIfIndexes())
        .then(() =>
          {
            // It'd better be there now
            if (! (entry.interface in ifIndexMap))
            {
              throw new Error(`Interface ${entry.interface} does not exist`);
            }

            return ifIndexMap[entry.interface];
          });
    };

    /*
     * The media-dependent `physical' address.
     */
    let             ipNetToMediaPhysAddress = async () =>
    {
      return hwAddr;
    };

    /*
     * The IpAddress corresponding to the media- dependent `physical' address.
     */
    let             ipNetToMediaNetAddress = async () =>
    {
      return entry.address;
    };

    /*
     * The type of mapping.
     *
     * Setting this object to the value invalid(2) has the effect of
     * invalidating the corresponding entry in the ipNetToMediaTable. That is,
     * it effectively dissasociates the interface identified with said entry
     * from the mapping identified with said entry. It is an
     * implementation-specific matter as to whether the agent removes an
     * invalidated entry from the table. Accordingly, management stations must
     * be prepared to receive tabular information from agents that corresponds
     * to entries not currently in use. Proper interpretation of such entries
     * requires examination of the relevant ipNetToMediaType object.
     */
    let             ipNetToMediaType = async () =>
    {
      // TODO: How do we determine this generically?
      return 1;                 // 1=other 2=invalid 3=dynamic 4=static
    };

    return Promise.all(
      [
        ipNetToMediaIfIndex(),
        ipNetToMediaPhysAddress(),
        ipNetToMediaNetAddress(),
        ipNetToMediaType()
      ])
      .then((results) =>
        {
          let result =
            {
              ipNetToMediaIfIndex    : results.shift(),
              ipNetToMediaPhysddress : results.shift(),
              ipNetToMediaNetAddress : results.shift(),
              ipNetToMediaType       : results.shift()
            };

          return result;
        });
  }

  /*
   * **********************************************************************
   * additional IP objects
   * **********************************************************************
   */

  /*
   * The number of routing entries which were chosen to be discarded even
   * though they are valid. One possible reason for discarding such an entry
   * could be to free-up buffer space for other routing entries.
   */
  async getIpRoutingDiscards()
  {
  }



  /*
   * *********************************************************************
   * the ICMP group
   *
   * Implementation of the ICMP group is mandatory for all systems.
   * *********************************************************************
   */

  /*
   * The total number of ICMP messages which the entity received. Note that
   * this counter includes all those counted by icmpInErrors.
   */
  async getIcmpInMsgs()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Icmp.InMsgs);
  }

  /*
   * The number of ICMP messages which the entity received but determined as
   * having ICMP-specific errors (bad ICMP checksums, bad length, etc.).
   */
  async getIcmpInErrors()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Icmp.InErrors);
  }

  /*
   * The number of ICMP Destination Unreachable messages received.
   */
  async getIcmpInDestUnreachs()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Icmp.InDestUnreachs);
  }

  /*
   * The number of ICMP Time Exceeded messages received.
   */
  async getIcmpInTimeExcds()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Icmp.InTimeExcds);
  }

  /*
   * The number of ICMP Parameter Problem messages received.
   */
  async getIcmpInParmProbs()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Icmp.InParmProbs);
  }

  /*
   * The number of ICMP Source Quench messages received.
   */
  async getIcmpInSrcQuenchs()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Icmp.InSrcQuenchs);
  }

  /*
   * The number of ICMP Redirect messages received.
   */
  async getIcmpInRedirects()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Icmp.InRedirects);
  }

  /*
   * The number of ICMP Echo (request) messages received.
   */
  async getIcmpInEchos()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Icmp.InEchos);
  }

  /*
   * The number of ICMP Echo Reply messages received.
   */
  async getIcmpInEchoReps()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Icmp.InEchoReps);
  }

  /*
   * The number of ICMP Timestamp (request) messages received.
   */
  async getIcmpInTimestamps()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Icmp.InTimestamps);
  }

  /*
   * The number of ICMP Timestamp Reply messages received.
   */
  async getIcmpInTimestampReps()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Icmp.InTimestampReps);
  }

  /*
   * The number of ICMP Address Mask Request messages received.
   */
  async getIcmpInAddrMasks()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Icmp.inAddrMasks);
  }

  /*
   * The number of ICMP Address Mask Reply messages received.
   */
  async getIcmpInAddrMaskReps()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Icmp.inAddrMaskReps);
  }

  /*
   * The total number of ICMP messages which this entity attempted to send.
   * Note that this counter includes all those counted by icmpOutErrors.
   */
  async getIcmpOutMsgs()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Icmp.OutMsgs);
  }

  /*
   * The number of ICMP messages which this entity did not send due to
   * problems discovered within ICMP such as a lack of buffers. This value
   * should not include errors discovered outside the ICMP layer such as the
   * inability of IP to route the resultant datagram. In some implementations
   * there may be no types of error which contribute to this counter's value.
   */
  async getIcmpOutErrors()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Icmp.OutErrors);
  }

  /*
   * The number of ICMP Destination Unreachable messages sent.
   */
  async getIcmpOutDestUnreachs()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Icmp.OutDestUnreachs);
  }

  /*
   * The number of ICMP Time Exceeded messages sent.
   */
  async getIcmpOutTimeExcds()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Icmp.OutTimeExcds);
  }

  /*
   * The number of ICMP Parameter Problem messages sent.
   */
  async getIcmpOutParmProbs()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Icmp.OutParmProbs);
  }

  /*
   * The number of ICMP Source Quench messages sent.
   */
  async getIcmpOutSrcQuenchs()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Icmp.OutSrcQuenchs);
  }

  /*
   * The number of ICMP Redirect messages sent. For a host, this object will
   * always be zero, since hosts do not send redirects.
   */
  async getIcmpOutRedirects()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Icmp.OutRedirects);
  }

  /*
   * The number of ICMP Echo (request) messages sent.
   */
  async getIcmpOutEchos()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Icmp.OutEchos);
  }

  /*
   * The number of ICMP Echo Reply messages sent.
   */
  async getIcmpOutEchoReps()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Icmp.OutEchoReps);
  }

  /*
   * The number of ICMP Timestamp (request) messages sent.
   */
  async getIcmpOutTimestamps()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Icmp.OutTimestamps);
  }

  /*
   * The number of ICMP Timestamp Reply messages sent.
   */
  async getIcmpOutTimestampReps()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Icmp.OutTimestampReps);
  }

  /*
   * The number of ICMP Address Mask Request messages sent.
   */
  async getIcmpOutAddrMasks()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Icmp.OutAddrMasks);
  }

  /*
   * The number of ICMP Address Mask Reply messages sent.
   */
  async getIcmpOutAddrMaskReps()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Icmp.OutAddrMaskReps);
  }


  /*
   * *********************************************************************
   * the TCP group
   *
   * Implementation of the TCP group is mandatory for all systems that
   * implement the TCP.
   *
   * Note that instances of object types that represent information about a
   * particular TCP connection are transient; they persist only as long as the
   * connection in question.
   * *********************************************************************
   */

  /*
   * The algorithm used to determine the timeout value used for retransmitting
   * unacknowledged octets.
   */
  async getTcpRtoAlgorithm()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Tcp.RtoAlgorithm);
  }

  /*
   * The minimum value permitted by a TCP implementation for the
   * retransmission timeout, measured in milliseconds. More refined semantics
   * for objects of this type depend upon the algorithm used to determine the
   * retransmission timeout. In particular, when the timeout algorithm is
   * rsre(3), an object of this type has the semantics of the LBOUND quantity
   * described in RFC 793.
   */
  async getTcpRtoMin()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Tcp.RtoMin);
  }

  /*
   * The maximum value permitted by a TCP implementation for the
   * retransmission timeout, measured in milliseconds. More refined semantics
   * for objects of this type depend upon the algorithm used to determine the
   * retransmission timeout. In particular, when the timeout algorithm is
   * rsre(3), an object of this type has the semantics of the UBOUND quantity
   * described in RFC 793.
   */
  async getTcpRtoMax()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Tcp.RtoMax);
  }

  /*
   * The limit on the total number of TCP connections the entity can support.
   * In entities where the maximum number of connections is dynamic, this
   * object should contain the value -1.
   */
  async getTcpMaxConn()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Tcp.MaxConn);
  }

  /*
   * The number of times TCP connections have made a direct transition to the
   * SYN-SENT state from the CLOSED state.
   */
  async getTcpActiveOpens()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Tcp.ActiveOpens);
  }

  /*
   * The number of times TCP connections have made a direct transition to the
   * SYN-RCVD state from the LISTEN state.
   */
  async getTcpPassiveOpens()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Tcp.PassiveOpens);
  }

  /*
   * The number of times TCP connections have made a direct transition to the
   * CLOSED state from either the SYN-SENT state or the SYN-RCVD state, plus
   * the number of times TCP connections have made a direct transition to the
   * LISTEN state from the SYN-RCVD state.
   */
  async getTcpAttemptFails()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Tcp.AttemptFails);
  }

  /*
   * The number of times TCP connections have made a direct transition to the
   * CLOSED state from either the ESTABLISHED state or the CLOSE-WAIT state.
   */
  async getTcpEstabResets()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Tcp.EstabResets);
  }

  /*
   * The number of TCP connections for which the current state is either
   * ESTABLISHED or CLOSE- WAIT.
   */
  async getTcpCurrEstab()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Tcp.CurrEstab);
  }

  /*
   * The total number of segments received, including those received in error.
   * This count includes segments received on currently established
   * connections.
   */
  async getTcpInSegs()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Tcp.InSegs);
  }

  /*
   * The total number of segments sent, including those on current connections
   * but excluding those containing only retransmitted octets.
   */
  async getTcpOutSegs()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Tcp.OutSegs);
  }

  /*
   * The total number of segments retransmitted - that is, the number of TCP
   * segments transmitted containing one or more previously transmitted
   * octets.
   */
  async getTcpRetransSegs()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Tcp.RetransSegs);
  }

  /*
   * A table containing TCP connection-specific information.
   */
  async getTcpConnTable()
  {
  }

  /*
   * Information about a particular current TCP connection. An object of this
   * type is transient, in that it ceases to exist when (or soon after) the
   * connection makes the transition to the CLOSED state.
   */
  async getTcpConnEntry()
  {
  }

  /*
   * The state of this TCP connection.
   *
   * The only value which may be set by a management station is deleteTCB(12).
   * Accordingly, it is appropriate for an agent to return a `badValue'
   * response if a management station attempts to set this object to any other
   * value.
   *
   * If a management station sets this object to the value deleteTCB(12), then
   * this has the effect of deleting the TCB (as defined in RFC 793) of the
   * corresponding connection on the managed node, resulting in immediate
   * termination of the connection.
   *
   * As an implementation-specific option, a RST
   *
   * segment may be sent from the managed node to the other TCP endpoint (note
   * however that RST segments are not sent reliably).
   */
  async getTcpConnState()
  {
  }

  /*
   * The local IP address for this TCP connection. In the case of a connection
   * in the listen state which is willing to accept connections for any IP
   * interface associated with the node, the value 0.0.0.0 is used.
   */
  async getTcpConnLocalAddress()
  {
  }

  /*
   * The local port number for this TCP connection.
   */
  async getTcpConnLocalPort()
  {
  }

  /*
   * The remote IP address for this TCP connection.
   */
  async getTcpConnRemAddress()
  {
  }

  /*
   * The remote port number for this TCP connection.
   */
  async getTcpConnRemPort()
  {
  }

  /*
   * The total number of segments received in error (e.g., bad TCP checksums).
   */
  async getTcpInErrs()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Tcp.InErrs);
  }

  /*
   * The number of TCP segments sent containing the RST flag.
   */
  async getTcpOutRsts()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Tcp.OutRsts);
  }


  /*
   * *********************************************************************
   * the UDP group
   *
   * Implementation of the UDP group is mandatory for all systems which
   * implement the UDP.
   * *********************************************************************
   */

  /*
   * The total number of UDP datagrams delivered to UDP users.
   */
  async getUdpInDatagrams()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Udp.InDatagrams);
  }

  /*
   * The total number of received UDP datagrams for which there was no
   * application at the destination port.
   */
  async getUdpNoPorts()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Udp.NoPorts);
  }

  /*
   * The number of received UDP datagrams that could not be delivered for
   * reasons other than the lack of an application at the destination port.
   */
  async getUdpInErrors()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Udp.InErrors);
  }

  /*
   * The total number of UDP datagrams sent from this entity.
   */
  async getUdpOutDatagrams()
  {
    return Promise.resolve()
      .then(() => this.getNetSnmpInfo())
      .then((info) => info.Udp.OutDatagrams);
  }

  /*
   * A table containing UDP listener information.
   */
  async getUdpTable()
  {
  }

  /*
   * Information about a particular current UDP listener.
   */
  async getUdpEntry()
  {
  }

  /*
   * The local IP address for this UDP listener. In the case of a UDP listener
   * which is willing to accept datagrams for any IP interface associated with
   * the node, the value 0.0.0.0 is used.
   */
  async getUdpLocalAddress()
  {
  }

  /*
   * The local port number for this UDP listener.
   */
  async getUdpLocalPort()
  {
  }


  /*
   * *********************************************************************
   * the EGP group
   *
   * Implementation of the EGP group is mandatory for all systems which
   * implement the EGP.
   * **********************************************************************
   */

  /*
   * The number of EGP messages received without error.
   */
  async getEgpInMsgs()
  {
  }

  /*
   * The number of EGP messages received that proved to be in error.
   */
  async getEgpInErrors()
  {
  }

  /*
   * The total number of locally generated EGP messages.
   */
  async getEgpOutMsgs()
  {
  }

  /*
   * The number of locally generated EGP messages not sent due to resource
   * limitations within an EGP entity.
   */
  async getEgpOutErrors()
  {
  }

  /*
   * The EGP neighbor table.
   */
  async getEgpNeighTable()
  {
  }

  /*
   * Information about this entity's relationship with a particular EGP
   * neighbor.
   */
  async getEgpNeighEntry()
  {
  }

  /*
   * The EGP state of the local system with respect to this entry's EGP
   * neighbor. Each EGP state is represented by a value that is one greater
   * than the numerical value associated with said state in RFC 904.
   */
  async getEgpNeighState()
  {
  }

  /*
   * The IP address of this entry's EGP neighbor.
   */
  async getEgpNeighAddr()
  {
  }

  /*
   * The autonomous system of this EGP peer. Zero should be specified if the
   * autonomous system number of the neighbor is not yet known.
   */
  async getEgpNeighAs()
  {
  }

  /*
   * The number of EGP messages received without error from this EGP peer.
   */
  async getEgpNeighInMsgs()
  {
  }

  /*
   * The number of EGP messages received from this EGP peer that proved to be
   * in error (e.g., bad EGP checksum).
   */
  async getEgpNeighInErrs()
  {
  }

  /*
   * The number of locally generated EGP messages to this EGP peer.
   */
  async getEgpNeighOutMsgs()
  {
  }

  /*
   * The number of locally generated EGP messages not sent to this EGP peer
   * due to resource limitations within an EGP entity.
   */
  async getEgpNeighOutErrs()
  {
  }

  /*
   * The number of EGP-defined error messages received from this EGP peer.
   */
  async getEgpNeighInErrMsgs()
  {
  }

  /*
   * The number of EGP-defined error messages sent to this EGP peer.
   */
  async getEgpNeighOutErrMsgs()
  {
  }

  /*
   * The number of EGP state transitions to the UP state with this EGP peer.
   */
  async getEgpNeighStateUps()
  {
  }

  /*
   * The number of EGP state transitions from the UP state to any other state
   * with this EGP peer.
   */
  async getEgpNeighStateDowns()
  {
  }

  /*
   * The interval between EGP Hello command retransmissions (in hundredths of
   * a second). This represents the t1 timer as defined in RFC 904.
   */
  async getEgpNeighIntervalHello()
  {
  }

  /*
   * The interval between EGP poll command retransmissions (in hundredths of a
   * second). This represents the t3 timer as defined in RFC 904.
   */
  async getEgpNeighIntervalPoll()
  {
  }

  /*
   * The polling mode of this EGP entity, either passive or active.
   */
  async getEgpNeighMode()
  {
  }

  /*
   * A control variable used to trigger operator- initiated Start and Stop
   * events. When read, this variable always returns the most recent value
   * that egpNeighEventTrigger was set to. If it has not been set since the
   * last initialization of the network management subsystem on the node, it
   * returns a value of `stop'.
   *
   * When set, this variable causes a Start or Stop event on the specified
   * neighbor, as specified on pages 8-10 of RFC 904. Briefly, a Start event
   * causes an Idle peer to begin neighbor acquisition and a non-Idle peer to
   * reinitiate neighbor acquisition. A stop event causes a non-Idle peer to
   * return to the Idle state until a Start event occurs, either via
   * egpNeighEventTrigger or otherwise.
   */
  async getEgpNeighEventTrigger()
  {
  }

  /*
   * The autonomous system number of this EGP entity.
   */
  async getEgpAs()
  {
  }
}

/**
 * This function ensures that we have a constant mapping of interface
 * to index for the duration of this library's runtime instance.
 *
 * @return {String[]}
 *   The input parameter is returned unaltered
 */
async function addIfIndexes()
{
  return Promise.resolve()
    .then(() => fsp.readdir("/sys/class/net"))
    .then(
      (ifNames) =>
      {
        // Add an entry to our interface index map, if not already there
        ifNames.forEach(
          (ifName) =>
          {
            if (! (ifName in ifIndexMap))
            {
              ifIndexMap[ifName] = nextIfIndex++;
            }
          });

        return ifNames;
      });
}

/**
 * Get the address information about each interface
 */
async function getAddressInfo()
{
  let             ret;
  let             iface;
  let             byIpAddr = { IPv4 : {}, IPv6 : {} };
  let             byHwAddr = { IPv4 : {}, IPv6 : {} };
  let             networkInterfaces = require("os").networkInterfaces();

  // For each interface...
  for (iface in networkInterfaces)
  {
    // For each entry in that interface's array...
    networkInterfaces[iface].forEach(
      (elem) =>
      {
        // Add the interface name to the entry
        elem.interface = iface;

        // Add this entry to the map keyed by IP address
        byIpAddr[elem.family][elem.address] = elem;

        // Add this entry to the map keyed by HW address, excluding
        // interface lo
        if (iface != "lo")
        {
          byHwAddr[elem.family][elem.mac] = elem;
        }
      });
  }

  // Give 'em the three maps
  ret = { networkInterfaces, byIpAddr, byHwAddr };
  return ret;
}

/**
 * Convert a hex IPv4 address, which is in reverse order, into its
 * normal dotted-decimal IPv4 address format.
 *
 * @param hex {String}
 *   The hex string to be convert to standard IP address format
 */
function hexToIp4(hex)
{
  let             ip = [];

  // Pad the hex string on the left, to ensure we have exactly 8 nibbles
  hex = ("00000000" + hex).substr(-8);

  // Split it ito its four components and reverse the order
  ip.unshift(hex.substr(0, 2));
  ip.unshift(hex.substr(2, 2));
  ip.unshift(hex.substr(4, 2));
  ip.unshift(hex.substr(6, 2));

  // Map each two-character hex string to a number
  ip = ip.map(v => parseInt(v, 16));

  // Join it back together into IP address format
  return ip.join(".");
}

/**
 * Get information about all IPv4 routes routes
 */
async function getRouteInfo4()
{
  let             routes = [];

  return Promise.resolve()
    .then(() => addIfIndexes())
    .then(() => fsp.readFile("/proc/net/route"))
    .then((content) => content.toString().split("\n"))
    .then(
      (lines) =>
      {
        lines.forEach(
          (line, i) =>
          {
            let             entry;
            let             fields;

            // Skip the first line, which is the field name definition
            if (i === 0)
            {
              return;
            }

            // If the line is empty, e.g., last line, we have nothing to do
            if (line.length === 0)
            {
              return;
            }

            // Split the line on whitespace
            fields = line.split(/\s+/g);

            // Add a route entry with the fields identified
            entry =
              {
                interface      : fields[0],
                interfaceIndex : ifIndexMap[fields.shift()],
                destination    : hexToIp4(fields.shift()),
                gateway        : hexToIp4(fields.shift()),
                flags          : parseInt(fields.shift(), 16),
                refcount       : +fields.shift(),
                use            : +fields.shift(),
                metric         : +fields.shift(),
                mask           : hexToIp4(fields.shift())
              };

            // Delete irrelevant/unused fields
            delete entry.refcount;
            delete entry.use;

            // Add this entry to the results
            routes.push(entry);
          });

        return routes;
      });
}



module.exports = SnmpLinuxLib;
