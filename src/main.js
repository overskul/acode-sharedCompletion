import plugin from '../plugin.json';
import { SharedCompletion } from './Plugin.js';

if (window.acode) {
  const mPlugin = new SharedCompletion(plugin);
  acode.setPluginInit(plugin.id, mPlugin.init.bind(mPlugin), mPlugin.pSettings);
  acode.setPluginUnmount(plugin.id, mPlugin.destroy.bind(mPlugin));
}
