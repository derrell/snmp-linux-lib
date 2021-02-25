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

let             mib;
let             linuxLib;
const           snmp = require("net-snmp");

module.exports = async function(
  agent,
  sysDescr,
  sysObjectID,
  sysContact,
  sysName,
  sysLocation,
  sysServices = Math.pow(2, 3-1) + Math.pow(2, 4-1), // layer 3+4,
  pciIdPath = "/usr/share/misc/pci.ids")
{
  let             store;
  let             providers;
  const           SnmpLinuxLib = require("./core");

  // Retrieve the MIB from the provided agent
  mib = agent.getMib();

  // Get access to the core library that provides results returned by snmp
  linuxLib = new SnmpLinuxLib(
    sysDescr,
    sysObjectID,
    sysContact,
    sysName,
    sysLocation,
    sysServices,
    pciIdPath);
  await linuxLib.init();

  function addSupportedScalarHandlers(providers)
  {
    // Add all of the scalar handlers that we support
    providers.forEach(
      (provider) =>
      {
        const           linuxLibFunction = getLinuxLibFunction(provider.name);

        // Ensure this is a scalar handler
        if (provider.type != snmp.MibProviderType.Scalar)
        {
          return;
        }

        // Ensure there's an implemention in this library for the name
        if (! (linuxLibFunction in linuxLib))
        {
          return;
        }

        // Add the handler for this dude. He's supported.
        addScalarHandler(provider);
      });
  }

  // Create the module store which additionally reads in the
  // base modules
  store = snmp.createModuleStore();
  providers = store.getProvidersForModule("RFC1213-MIB");
  mib.registerProviders(providers);
  addSupportedScalarHandlers(providers);

  // Load non-base modules
  [
    "IPV6-TC",
    "IPV6-MIB",
    "IPV6-ICMP-MIB",
    "IPV6-TCP-MIB",
    "IPV6-UDP-MIB"
  ].forEach(
    (module) =>
    {
      store.loadFromFile(`${__dirname}/mibs/${module}.mib`);
      providers = store.getProvidersForModule(module);
      mib.registerProviders(providers);
      addSupportedScalarHandlers(providers);
    });

  // Add the table handlers
  addIfTableHandler(mib.getProvider("ifEntry"));
  addIpAddrTableHandler(mib.getProvider("ipAddrEntry"));
  addIpRouteTableHandler(mib.getProvider("ipRouteEntry"));
  addIpNetToMediaTableHandler(mib.getProvider("ipNetToMediaEntry"));
  addTcpConnTableHandler(mib.getProvider("tcpConnEntry"));
  addUdpTableHandler(mib.getProvider("udpEntry"));
  addIpv6IfTableHandler(mib.getProvider("ipv6IfEntry"));
  addIpv6IfStatsTableHandler(mib.getProvider("ipv6IfStatsEntry"));
  addIpv6AddrTableHandler(mib.getProvider("ipv6AddrEntry"));
};

/*
 * Convert the provider name into its equivalent linuxLib method, by
 * upper-casing the first character, and prepending "get"
 */
function getLinuxLibFunction(s)
{
  return "get" + s.charAt(0).toUpperCase() + s.slice(1);
}

/*
 * Add a handler to a specified scalar provider.
 */
function addScalarHandler(provider)
{
  provider.handler =
    async (mibRequest) =>
    {
      const           linuxLibFunction = getLinuxLibFunction(provider.name);
      const           value = await linuxLib[linuxLibFunction]();

      mib.setScalarValue(provider.name, value);
      mibRequest.done();
    };

  // Each scalar needs an initial value. Without it, the handler will
  // never be called, when receiving a GET request
  switch(provider.scalarType)
  {
  case snmp.ObjectType.Integer : // also Integer32
  case snmp.ObjectType.Counter : // also Counter32
  case snmp.ObjectType.Gauge :   // also Gauge32 & Unsigned32
  case snmp.ObjectType.TimeTicks :
  case snmp.ObjectType.Counter64 :
    mib.setScalarValue(provider.name, 0);
    break;

  case snmp.ObjectType.OctetString :
  case snmp.ObjectType.Opaque :
    mib.setScalarValue(provider.name, "");
    break;

  case snmp.ObjectType.OID :
    mib.setScalarValue(provider.name, "0.0");
    break;

  case snmp.ObjectType.IpAddress :
    mib.setScalarValue(provider.name, "127.0.0.1");
    break;

  case snmp.ObjectType.Null :
  case snmp.ObjectType.EndOfMibView :
  case snmp.ObjectType.NoSuchObject :
  case snmp.ObjectType.NoSuchInstance :
  default :
    throw new Error("Unexpected object type: " + provider.scalarType);
  }
}


/*
 * Internal function for adding a table handler
 */
function _addTableHandler(provider, fAddEntries)
{
  let             populate =
    async (bVirgin) =>
    {
      let             columns;

      // First clear out the existing table. This ensures that if
      // there are fewer entries now than there were before, the
      // now-nonexistent ones will not be returned
      if (! bVirgin)
      {
        columns = mib.getTableColumnCells(provider.name, 0, true);
        if (columns)
          columns.forEach(
            ( [ rowIndex, columnValues ] ) =>
            {
              mib.deleteTableRow(provider.name, rowIndex);
            });
      }

      // Call the table-specific function to add the data to comply
      // with this request
      await fAddEntries(provider);
    };

  provider.handler =
    async (mibRequest) =>
    {
      await populate();
      mibRequest.done();
    };

  // Each table needs an initial value. Without it, the handler will
  // never be called, when receiving a GET request
  populate(true);
}

/*
 * Add a handler for ifTable
 */
function addIfTableHandler(provider)
{
  _addTableHandler(
    provider,
    async () =>
    {
      const           entries = await linuxLib.getIfTable();
      entries.forEach(
        (entry) =>
        {
          let             row = [];

          row.push(entry.ifIndex);
          row.push(entry.ifDescr);
          row.push(entry.ifType);
          row.push(entry.ifMtu);
          row.push(entry.ifSpeed);
          row.push(entry.ifPhysAddress);
          row.push(entry.ifAdminStatus);
          row.push(entry.ifOperStatus);
          row.push(entry.ifLastChange);
          row.push(entry.ifInOctets);
          row.push(entry.ifInUcastPkts);
          row.push(entry.ifInNUcastPkts);
          row.push(entry.ifInDiscards);
          row.push(entry.ifInErrors);
          row.push(entry.ifInUnknownProtos);
          row.push(entry.ifOutOctets);
          row.push(entry.ifOutUcastPkts);
          row.push(entry.ifOutNUcastPkts);
          row.push(entry.ifOutDiscards);
          row.push(entry.ifOutErrors);
          row.push(entry.ifOutQLen);
          row.push(entry.ifSpecific);

          mib.addTableRow(provider.name, row);
        });
    });
}

/*
 * Add a handler for ipAddrTable
 */
function addIpAddrTableHandler(provider)
{
  _addTableHandler(
    provider,
    async () =>
    {
      const           entries = await linuxLib.getIpAddrTable();
      entries.forEach(
        (entry) =>
        {
          let             row = [];

          row.push(entry.ipAdEntAddr);
          row.push(entry.ipAdEntIfIndex);
          row.push(entry.ipAdEntNetMask);
          row.push(entry.ipAdEntBcastAddr);
          row.push(entry.ipAdEntReasmMaxSize);

          mib.addTableRow(provider.name, row);
        });
    });
}

/*
 * Add a handler for ipRouteTable
 */
function addIpRouteTableHandler(provider)
{
  _addTableHandler(
    provider,
    async () =>
    {
      const           entries = await linuxLib.getIpRouteTable();
      entries.forEach(
        (entry) =>
        {
          let             row = [];

          row.push(entry.destination);    // ipRouteDest
          row.push(entry.interfaceIndex); // ipRouteIfIndex
          row.push(entry.metric);         // ipRouteMetric1
          row.push(-1);                   // ipRouteMetric2
          row.push(-1);                   // ipRouteMetric3
          row.push(-1);                   // ipRouteMetric4
          row.push(entry.gateway);        // ipRouteNextHop
          row.push(1);                    // ipRouteType
          row.push(1);                    // ipRouteProto
          row.push(0);                    // ipRouteAge
          row.push(entry.mask);           // ipRouteMask
          row.push(-1);                   // ipRouteMetric5
          row.push("0.0");                // ipRouteInfo

          mib.addTableRow(provider.name, row);
        });
    });
}

/*
 * Add a handler for ipNetToMediaTable
 */
function addIpNetToMediaTableHandler(provider)
{
  _addTableHandler(
    provider,
    async () =>
    {
      const           entries = await linuxLib.getIpNetToMediaTable();
      entries.forEach(
        (entry) =>
        {
          let             row = [];

          row.push(entry.ipNetToMediaIfIndex);
          row.push(entry.ipNetToMediaPhysAddress);
          row.push(entry.ipNetToMediaNetAddress);
          row.push(entry.ipNetToMediaType);

          mib.addTableRow(provider.name, row);
        });
    });
}

/*
 * Add a handler for tcpConnTable
 */
function addTcpConnTableHandler(provider)
{
  _addTableHandler(
    provider,
    async () =>
    {
      const           entries = await linuxLib.getTcpConnTable();
      entries.forEach(
        (entry) =>
        {
          let             row = [];

          row.push(entry.tcpConnState);
          row.push(entry.tcpConnLocalAddress);
          row.push(entry.tcpConnLocalPort);
          row.push(entry.tcpConnRemAddress);
          row.push(entry.tcpConnRemPort);

          mib.addTableRow(provider.name, row);
        });
    });
}


/*
 * Add a handler for udpTable
 */
async function addUdpTableHandler(provider)
{
  _addTableHandler(
    provider,
    async () =>
    {
      const           entries = await linuxLib.getUdpTable();
      entries.forEach(
        (entry) =>
        {
          let             row = [];

          row.push(entry.udpLocalAddress);
          row.push(entry.udpLocalPort);

          mib.addTableRow(provider.name, row);
        });
    });
}

/*
 * Add a handler for ipv6IfTable
 */
function addIpv6IfTableHandler(provider)
{
  _addTableHandler(
    provider,
    async () =>
    {
      const           entries = await linuxLib.getIpv6IfTable();
      entries.forEach(
        (entry) =>
        {
          let             row = [];

          row.push(entry.ipv6IfIndex);
          row.push(entry.ipv6IfDescr);
          row.push(entry.ipv6IfLowerLayer);
          row.push(entry.ipv6IfEffectiveMtu);
          row.push(entry.ipv6IfReasmMaxSize);
          row.push(entry.ipv6IfIdentifier);
          row.push(entry.ipv6IfIdentifierLength);
          row.push(entry.ipv6IfPhysicalAddress);
          row.push(entry.ipv6IfAdminStatus);
          row.push(entry.ipv6IfOperStatus);
          row.push(entry.ipv6IfLastChange);

          mib.addTableRow(provider.name, row);
        });
    });
}

/*
 * Add a handler for ipv6IfStatsTable
 */
function addIpv6IfStatsTableHandler(provider)
{
  _addTableHandler(
    provider,
    async () =>
    {
      const           entries = await linuxLib.getIpv6IfStatsTable();

      entries.forEach(
        (entry) =>
        {
          let             row = [];

          // Ipv6IfStatsTable augments Ipv6IfTable. We therefore need
          // to prepend the index of the corresponding Ipv6IfTable
          // entry
          row.push(entry.ipv6IfIndex);

          // Now add the members of this table entry
          row.push(entry.Ip6InReceives);
          row.push(entry.Ip6InHdrErrors);
          row.push(entry.Ip6InTooBigErrors);
          row.push(entry.Ip6InNoRoutes);
          row.push(entry.Ip6InAddrErrors);
          row.push(entry.Ip6InUnknownProtos);
          row.push(entry.Ip6InTruncatedPkts);
          row.push(entry.Ip6InDiscards);
          row.push(entry.Ip6InDelivers);
          row.push(entry.Ip6OutForwDatagrams);
          row.push(entry.Ip6OutRequests);
          row.push(entry.Ip6OutDiscards);
          row.push(entry.Ip6FragOKs);
          row.push(entry.Ip6FragFails);
          row.push(entry.Ip6FragCreates);
          row.push(entry.Ip6ReasmReqds);
          row.push(entry.Ip6ReasmOKs);
          row.push(entry.Ip6ReasmFails);
          row.push(entry.Ip6InMcastPkts);
          row.push(entry.Ip6OutMcastPkts);

          mib.addTableRow(provider.name, row);
        });
    });
}

/*
 * Add a handler for ipv6AddrTable
 */
function addIpv6AddrTableHandler(provider)
{
  _addTableHandler(
    provider,
    async () =>
    {
      const           entries = await linuxLib.getIpv6AddrTable();

      entries.forEach(
        (entry) =>
        {
          let             row = [];

          // Ipv6AddrTable uses the index of Ipv6IfTable. We therefore
          // need to prepend the index of the corresponding
          // Ipv6IfTable entry
          row.push(entry.ipv6IfIndex);

          // Now add the members of this table entry
          row.push(entry.ipv6AddrAddress);
          row.push(entry.ipv6AddrPfxLength);
          row.push(entry.ipv6AddrType);
          row.push(entry.ipv6AddrAnycastFlag);
          row.push(entry.ipv6AddrStatus);

          mib.addTableRow(provider.name, row);
        });
    });
}
