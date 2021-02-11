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

let             pciIds;
const           fsp = require("fs").promises;

class SnmpLinuxLib
{
  cache = {};

  constructor(
    sysDescr,
    sysObjectID,
    sysContact,
    sysName,
    sysLocation,
    sysServices,
    pciIdPath = "/usr/share/misc/pci.ids")
  {
    // Do a one-time parse of the PCI ID database
    pciIds = require("./parsePciIds")(pciIdPath);

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

  /**
   * The number of network interfaces (regardless of their current state)
   * present on this system.
   */
  async getIfNumber()
  {
    return Promise.resolve()
      .then(() => fsp.readdir("/sys/class/net"))
      .then((files) => files.length);
  }

  /**
   * A list of interface entries. The number of entries is given by the value
   * of ifNumber.
   */
  async getIfTable()
  {
    return Promise.resolve()
      .then(() => fsp.readdir("/sys/class/net"))
      .then((files) =>
        {
          return Promise.all(
            files.map((file, i) => this.getIfEntryInfo(file, i)));
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
    let             ifIndex             = index + 1;

    /*
     * A textual string containing information about the interface. This
     * string should include the name of the manufacturer, the product name
     * and the version of the hardware interface.
     */
    let             ifDescr             = async function()
    {
      let             vendor;
      let             device;
      let             revision;

      return Promise.all(
        [
          fsp.readFile(`/sys/class/net/${ifName}/device/vendor`),
          fsp.readFile(`/sys/class/net/${ifName}/device/device`),
          fsp.readFile(`/sys/class/net/${ifName}/device/revision`)
        ])
        .then(
          (results) =>
          {
            vendor = results.shift().toString().trim();
            device = results.shift().toString().trim();
            revision = results.shift().toString().trim();

            return `Vendor: ${vendor} | Device: ${device} | Rev : ${revision}`;
          });
    };

    /*
     * The type of interface, distinguished according to the physical/link
     * protocol(s) immediately `below' the network layer in the protocol
     * stack.
     */
    let             ifType              = async function()
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
    let             ifMtu               = async function()
    {
      return Promise.resolve()
        .then(() => fsp.readFile(`/sys/class/net/${ifName}/mtu`))
        .then(v => v.toString().trim());
    };

    /*
     * An estimate of the interface's current bandwidth in bits per second.
     * For interfaces which do not vary in bandwidth or for those where no
     * accurate estimation can be made, this object should contain the nominal
     * bandwidth.
     */
    let             ifSpeed             = async function()
    {
      let             speed;

      return Promise.resolve()
        .then(() => fsp.readFile(`/sys/class/net/${ifName}/speed`))
        .then(v => speed = v.toString().trim())
        .catch((e) => speed = 100) // in case it's not available
        .then(() => speed);
    };

    /*
     * The interface's address at the protocol layer immediately `below' the
     * network layer in the protocol stack. For interfaces which do not have
     * such an address (e.g., a serial line), this object should contain an
     * octet string of zero length.
     */
    let             ifPhysAddress       = async function()
    {
      return Promise.resolve()
        .then(() => fsp.readFile(`/sys/class/net/${ifName}/address`))
        .then(v => v.toString().trim());
    };

    /*
     * The desired state of the interface. The testing(3) state indicates that
     * no operational packets can be passed.
     */
    let             ifAdminStatus       = async function()
    {
      return 1;                 // 1=up 2=down 3=testing
    };

    /*
     * The current operational state of the interface. The testing(3) state
     * indicates that no operational packets can be passed.
     */
    let             ifOperStatus        = async function()
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
    let             ifLastChange        = async function()
    {
      return 0; // Assume interface came up before management system
    };

    /*
     * The total number of octets received on the interface, including
     * framing characters.
     */
    let             ifInOctets          = async function()
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
    let             ifInUcastPkts       = async function()
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
    let             ifInNUcastPkts      = async function()
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
    let             ifInDiscards        = async function()
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
    let             ifInErrors          = async function()
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
    let             ifInUnknownProtos   = async function()
    {
      return Promise.resolve()
        .then(() =>
          fsp.readFile(`/sys/class/net/${ifName}/statistics/rx_dropped`))
        .then(v => +v.toString().trim());
    };
/*
    let             ifOutOctets         = getIfOutOctets();
    let             ifOutUcastPkts      = getIfOutUcastPkts();
    let             ifOutNUcastPkts     = getIfOutNUcastPkts();
    let             ifOutDiscards       = getIfOutDiscards();
    let             ifOutErrors         = getIfOutErrors();
    let             ifOutQLen           = getIfOutQLen();
    let             ifSpecific          = getIfSpecific();
*/


    return Promise.all(
      [
        ifIndex,
        ifDescr,
        ifType,
        ifMtu,
        ifSpeed,
        ifPhysAddress,
        ifAdminStatus,
        ifOperStatus,
        ifLastChange,
/*
        ifInOctets,
        ifInUcastPkts,
        ifInNUcastPkts,
        ifInDiscards,
        ifInErrors,
        ifInUnknownProtos,
        ifOutOctets,
        ifOutUcastPkts,
        ifOutNUcastPkts,
        ifOutDiscards,
        ifOutErrors,
        ifOutQLen,
        ifSpecific
*/
      ])
      .then((results) =>
        {
          return (
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
/*
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
*/
            });
        });
  }

  async getAtTable()
  {
  }

  async getAtEntry()
  {
  }

  async getAtIfIndex()
  {
  }

  async getAtPhysAddress()
  {
  }

  async getAtNetAddress()
  {
  }

  async getIpForwarding()
  {
  }

  async getIpDefaultTTL()
  {
  }

  async getIpInReceives()
  {
  }

  async getIpInHdrErrors()
  {
  }

  async getIpInAddrErrors()
  {
  }

  async getIpForwDatagrams()
  {
  }

  async getIpInUnknownProtos()
  {
  }

  async getIpInDiscards()
  {
  }

  async getIpInDelivers()
  {
  }

  async getIpOutRequests()
  {
  }

  async getIpOutDiscards()
  {
  }

  async getIpOutNoRoutes()
  {
  }

  async getIpReasmTimeout()
  {
  }

  async getIpReasmReqds()
  {
  }

  async getIpReasmOKs()
  {
  }

  async getIpReasmFails()
  {
  }

  async getIpFragOKs()
  {
  }

  async getIpFragFails()
  {
  }

  async getIpFragCreates()
  {
  }

  async getIpAddrTable()
  {
  }

  async getIpAddrEntry()
  {
  }

  async getIpAdEntAddr()
  {
  }

  async getIpAdEntIfIndex()
  {
  }

  async getIpAdEntNetMask()
  {
  }

  async getIpAdEntBcastAddr()
  {
  }

  async getIpAdEntReasmMaxSize()
  {
  }

  async getIpRouteTable()
  {
  }

  async getIpRouteEntry()
  {
  }

  async getIpRouteDest()
  {
  }

  async getIpRouteIfIndex()
  {
  }

  async getIpRouteMetric1()
  {
  }

  async getIpRouteMetric2()
  {
  }

  async getIpRouteMetric3()
  {
  }

  async getIpRouteMetric4()
  {
  }

  async getIpRouteNextHop()
  {
  }

  async getIpRouteType()
  {
  }

  async getIpRouteProto()
  {
  }

  async getIpRouteAge()
  {
  }

  async getIpRouteMask()
  {
  }

  async getIpRouteMetric5()
  {
  }

  async getIpRouteInfo()
  {
  }

  async getIpNetToMediaTable()
  {
  }

  async getIpNetToMediaEntry()
  {
  }

  async getIpNetToMediaIfIndex()
  {
  }

  async getIpNetToMediaPhysAddress()
  {
  }

  async getIpNetToMediaNetAddress()
  {
  }

  async getIpNetToMediaType()
  {
  }

  async getIpRoutingDiscards()
  {
  }

  async getIcmpInMsgs()
  {
  }

  async getIcmpInErrors()
  {
  }

  async getIcmpInDestUnreachs()
  {
  }

  async getIcmpInTimeExcds()
  {
  }

  async getIcmpInParmProbs()
  {
  }

  async getIcmpInSrcQuenchs()
  {
  }

  async getIcmpInRedirects()
  {
  }

  async getIcmpInEchos()
  {
  }

  async getIcmpInEchoReps()
  {
  }

  async getIcmpInTimestamps()
  {
  }

  async getIcmpInTimestampReps()
  {
  }

  async getIcmpInAddrMasks()
  {
  }

  async getIcmpInAddrMaskReps()
  {
  }

  async getIcmpOutMsgs()
  {
  }

  async getIcmpOutErrors()
  {
  }

  async getIcmpOutDestUnreachs()
  {
  }

  async getIcmpOutTimeExcds()
  {
  }

  async getIcmpOutParmProbs()
  {
  }

  async getIcmpOutSrcQuenchs()
  {
  }

  async getIcmpOutRedirects()
  {
  }

  async getIcmpOutEchos()
  {
  }

  async getIcmpOutEchoReps()
  {
  }

  async getIcmpOutTimestamps()
  {
  }

  async getIcmpOutTimestampReps()
  {
  }

  async getIcmpOutAddrMasks()
  {
  }

  async getIcmpOutAddrMaskReps()
  {
  }

  async getTcpRtoAlgorithm()
  {
  }

  async getTcpRtoMin()
  {
  }

  async getTcpRtoMax()
  {
  }

  async getTcpMaxConn()
  {
  }

  async getTcpActiveOpens()
  {
  }

  async getTcpPassiveOpens()
  {
  }

  async getTcpAttemptFails()
  {
  }

  async getTcpEstabResets()
  {
  }

  async getTcpCurrEstab()
  {
  }

  async getTcpInSegs()
  {
  }

  async getTcpOutSegs()
  {
  }

  async getTcpRetransSegs()
  {
  }

  async getTcpConnEntry()
  {
  }

  async getTcpConnState()
  {
  }

  async getTcpConnLocalAddress()
  {
  }

  async getTcpConnLocalPort()
  {
  }

  async getTcpConnRemAddress()
  {
  }

  async getTcpConnRemPort()
  {
  }

  async getTcpInErrs()
  {
  }

  async getTcpOutRsts()
  {
  }

  async getUdpInDatagrams()
  {
  }

  async getUdpNoPorts()
  {
  }

  async getUdpInErrors()
  {
  }

  async getUdpOutDatagrams()
  {
  }

  async getUdpTable()
  {
  }

  async getUdpEntry()
  {
  }

  async getUdpLocalAddress()
  {
  }

  async getUdpLocalPort()
  {
  }

  async getEgpInMsgs()
  {
  }

  async getEgpInErrors()
  {
  }

  async getEgpOutMsgs()
  {
  }

  async getEgpOutErrors()
  {
  }

  async getEgpNeighTable()
  {
  }

  async getEgpNeighEntry()
  {
  }

  async getEgpNeighState()
  {
  }

  async getEgpNeighAddr()
  {
  }

  async getEgpNeighAs()
  {
  }

  async getEgpNeighInMsgs()
  {
  }

  async getEgpNeighInErrs()
  {
  }

  async getEgpNeighOutMsgs()
  {
  }

  async getEgpNeighOutErrs()
  {
  }

  async getEgpNeighInErrMsgs()
  {
  }

  async getEgpNeighOutErrMsgs()
  {
  }

  async getEgpNeighStateUps()
  {
  }

  async getEgpNeighStateDowns()
  {
  }

  async getEgpNeighIntervalHello()
  {
  }

  async getEgpNeighIntervalPoll()
  {
  }

  async getEgpNeighMode()
  {
  }

  async getEgpNeighEventTrigger()
  {
  }

  async getEgpAs()
  {
  }

  async getSnmpInPkts()
  {
  }

  async getSnmpOutPkts()
  {
  }

  async getSnmpInBadVersions()
  {
  }

  async getSnmpInBadCommunityNames()
  {
  }

  async getSnmpInBadCommunityUses()
  {
  }

  async getSnmpInASNParseErrs()
  {
  }

  async getSnmpInTooBigs()
  {
  }

  async getSnmpInNoSuchNames()
  {
  }

  async getSnmpInBadValues()
  {
  }

  async getSnmpInReadOnlys()
  {
  }

  async getSnmpInGenErrs()
  {
  }

  async getSnmpInTotalReqVars()
  {
  }

  async getSnmpInTotalSetVars()
  {
  }

  async getSnmpInGetRequests()
  {
  }

  async getSnmpInGetNexts()
  {
  }

  async getSnmpInSetRequests()
  {
  }

  async getSnmpInGetResponses()
  {
  }

  async getSnmpInTraps()
  {
  }

  async getSnmpOutTooBigs()
  {
  }

  async getSnmpOutNoSuchNames()
  {
  }

  async getSnmpOutBadValues()
  {
  }

  async getSnmpOutGenErrs()
  {
  }

  async getSnmpOutGetRequests()
  {
  }

  async getSnmpOutGetNexts()
  {
  }

  async getSnmpOutSetRequests()
  {
  }

  async getSnmpOutGetResponses()
  {
  }

  async getSnmpOutTraps()
  {
  }

  async getSnmpEnableAuthenTraps()
  {
  }
}

module.exports = SnmpLinuxLib;
