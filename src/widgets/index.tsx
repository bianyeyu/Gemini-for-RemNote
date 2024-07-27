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
    widgetTabIcon: "https://uxwing.com/wp-content/themes/uxwing/download/brands-and-social-media/google-gemini-icon.png",
  });
  // Register a custom Power-up tag for the Knowledge Base
  await plugin.app.registerPowerup({
    name: 'Gemini Knowledge Base',
    code: 'geminiKB',
    description: 'Marks Rems as part of the Gemini Knowledge Base',
    options: { 
      properties: [] // No additional properties needed for this power-up
    } // 添加了 options 参数
  });

  // Register slash command to add Knowledge Base tag
  await plugin.app.registerCommand({
    id: 'gemini-add-to-knowledge-base',
    name: 'Gemini: Add to Knowledge Base',
    description: 'Add the selected Rem(s) to the Gemini Knowledge Base',
    action: async () => {
      const selection = await plugin.editor.getSelection();

      if (selection && selection.type === SelectionType.Rem) { // 使用导入的 SelectionType
        // Get the Rem objects from the selection
        const selectedRems = await plugin.rem.findMany(selection.remIds);

        // ... (rest of the code is the same)
      } else {
        await plugin.app.toast('Please select one or more Rems.');
      }
    },
  });
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);