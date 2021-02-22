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

      // We support all scalar providers in RFC1213-MIB except those
      // whose names begin with "egp" and "snmp"
      if (provider.name.startsWith("egp") || provider.name.startsWith("snmp"))
      {
        return;
      }

      // Add the handler for this dude!
      addScalarHandler(provider);
    });

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
 * Add a handler to a scalar provider.
 */
function addScalarHandler(provider)
{
  console.log("Adding scalar handler for " + provider.name);

  provider.handler =
    async (mibRequest) =>
    {
      const           linuxLibFunction = getLinuxLibFunction(provider.name);
console.log("Calling linuxLib function: " + linuxLibFunction);
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
