import {
  declareIndexPlugin,
  ReactRNPlugin,
  WidgetLocation,
} from '@remnote/plugin-sdk';
import '../style.css';
import '../App.css';

async function onActivate(plugin: ReactRNPlugin) {
  // Register API Key setting
  await plugin.settings.registerStringSetting({
    id: 'gemini-api-key',
    title: 'Gemini API Key',
    description: 'Enter your Gemini API Key here.',
  });

  // Register System Instructions setting
  await plugin.settings.registerStringSetting({
    id: 'system-instructions',
    title: 'System Instructions',
    description: 'Optional system instructions for Gemini.',
  });

  // Create Knowledge Base powerup Rem
  const kbRem = await plugin.rem.createRem();
  if (kbRem) {
    await kbRem.setText(['#GeminiKB']);
  } else {
    plugin.app.toast('Failed to create knowledge base Rem!');
    return;
  }

  // Store KB Rem ID in settings
  await plugin.settings.registerStringSetting({
    id: 'knowledge-base-rem-id',
    title: 'Knowledge Base Rem ID (Do Not Modify)',
    description: 'Internal setting for the plugin. Do not modify.',
    defaultValue: kbRem._id,
  });

  // Register Gemini Model setting
  await plugin.settings.registerDropdownSetting({
    id: 'gemini-model',
    title: 'Gemini Model',
    description: 'Select the Gemini model to use.',
    options: [
      { key: 'gemini-pro', value: 'gemini-1.5-pro', label: 'Gemini Pro' },
      { key: 'gemini-flash', value: 'gemini-1.5-flash', label: 'Gemini Flash' },
    ],
    defaultValue: 'gemini-1.5-flash',
  });

  // Register the sidebar widget
  await plugin.app.registerWidget('sample_widget', WidgetLocation.RightSidebar, {
    dimensions: { height: 'auto', width: '100%' },
  });
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);