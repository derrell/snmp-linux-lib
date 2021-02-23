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
  sysServices,
  pciIdPath = "/usr/share/misc/pci.ids")
{
  let             store;
  let             providers;
  const           SnmpLinuxLib = require("./core");

  // Retrieve the MIB from the provided agent
  mib = agent.getMib();

  // Create the module store which additionally reads in the
  // base modules
  store = snmp.createModuleStore();
  providers = store.getProvidersForModule("RFC1213-MIB");
  mib.registerProviders(providers);

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

  // Add all of the scalar handlers that we support
  providers.forEach(
    (provider) =>
    {
      // Ensure this is a scalar handler
      if (provider.type != snmp.MibProviderType.Scalar)
      {
        return;
      }

      // Our core library supports all scalar providers in RFC1213-MIB
      // except those whose names begin with "egp" and "snmp"
      if (provider.name.startsWith("egp") || provider.name.startsWith("snmp"))
      {
        return;
      }

      // Add the handler for this dude!
      addScalarHandler(provider);
    });

  // Add the table handlers
  addIfTableHandler(mib.getProvider("ifEntry"));
  addIpAddrTableHandler(mib.getProvider("ipAddrEntry"));
  addIpRouteTableHandler(mib.getProvider("ipRouteEntry"));
  addIpNetToMediaTableHandler(mib.getProvider("ipNetToMediaEntry"));
  addTcpConnTableHandler(mib.getProvider("tcpConnEntry"));
  addUdpTableHandler(mib.getProvider("udpEntry"));
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
