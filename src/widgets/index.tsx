import { declareIndexPlugin, ReactRNPlugin, WidgetLocation } from '@remnote/plugin-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import '../style.css';
import '../App.css';

// Define chat history structure
interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

async function onActivate(plugin: ReactRNPlugin) {
  // Register API Key setting
  await plugin.settings.registerStringSetting({
    id: 'gemini-api-key',
    title: 'Gemini API Key',
    description: 'Enter your Gemini API key here.',
  });

  // Register Command Explanation Prompt setting
  await plugin.settings.registerStringSetting({
    id: 'command-explanation-prompt',
    title: 'Command Explanation Prompt',
    description: 'Prompt for explaining commands.',
    defaultValue: 'Explain the following command in detail:\n',
  });

  // Register Card Creation Prompt setting
  await plugin.settings.registerStringSetting({
    id: 'card-creation-prompt',
    title: 'Card Creation Prompt',
    description: 'Prompt for creating flashcards.',
    defaultValue:
      'Create flashcards based on the following text, using the principle of information minimization:\n',
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

  // Now create the Knowledge Base powerup Rem (after settings registration)
  const kbRem = await plugin.rem.createRem();
  if (kbRem) {
    await kbRem.setText(['#GeminiKB']); 
  } else {
    plugin.app.toast('Failed to create knowledge base Rem!');
    return; 
  }

  // Store KB Rem ID in settings for easy access
  await plugin.settings.registerStringSetting({
    id: 'knowledge-base-rem-id',
    title: 'Knowledge Base Rem ID',
    description: 'Do not modify. Stores the Rem ID for the Gemini knowledge base.',
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

  // Register explanation slash command
  await plugin.app.registerCommand({
    id: 'gemini-explain',
    name: 'Gemini: Explain',
    action: async () => {
      const focusedRem = await plugin.focus.getFocusedRem();
      if (!focusedRem) {
        plugin.app.toast('No Rem is focused!');
        return ''; 
      }

      const remText = await plugin.richText.toString(focusedRem.text);

      const explanation = await getGeminiExplanation(plugin, remText);

    const explanationRem = await plugin.rem.createRem();
    if (explanationRem) {
        await explanationRem.setText([explanation]);
        await explanationRem.setParent(focusedRem._id);

        return explanation; 
    } else {
      plugin.app.toast('Failed to create explanation Rem!');
      return '';
    }
  },
});

  // Register card creation slash command
  await plugin.app.registerCommand({
    id: 'gemini-create-cards',
    name: 'Gemini: Create Cards',
    action: async () => {
      const focusedRem = await plugin.focus.getFocusedRem();
      if (!focusedRem) {
        plugin.app.toast('No Rem is focused!');
        return ''; 
      }

      const remText = await plugin.richText.toString(focusedRem.text);

      const cards = await getGeminiCards(plugin, remText);

      for (const card of cards) {
        const cardRem = await plugin.rem.createRem();
        if (cardRem) {
          await cardRem.setText([card.front]);
          await cardRem.setBackText([card.back]);
          await cardRem.setParent(focusedRem._id);
          await cardRem.setIsCardItem(true);

          return `${card.front}\n${card.back}`; 
      } else {
        plugin.app.toast('Failed to create card Rem!');
      }
    }
    return ''; 
  },
});

  // Register the sidebar widget
  await plugin.app.registerWidget(
    'sample_widget',
    WidgetLocation.RightSidebar,
    {
      dimensions: { height: 'auto', width: '100%' },
    },
  );
}

// Function to get explanation from Gemini API
async function getGeminiExplanation(
  plugin: ReactRNPlugin,
  text: string,
): Promise<string> {
  const apiKey = await plugin.settings.getSetting<string>('gemini-api-key');
  const explanationPrompt = await plugin.settings.getSetting<string>(
    'command-explanation-prompt',
  );
  const geminiModel = await plugin.settings.getSetting<string>('gemini-model');
  const kbRemId = await plugin.settings.getSetting<string>('knowledge-base-rem-id');

  if (!apiKey) {
    return 'API key not set!';
  }

  try {
    const gemini = new GoogleGenerativeAI(apiKey);

    // Get knowledge base content
    const kbRem = await plugin.rem.findOne(kbRemId);
    let kbContent = '';
    if (kbRem && kbRem.children) {
      const kbChildren = await plugin.rem.findMany(kbRem.children);
      kbContent = kbChildren.map(rem => plugin.richText.toString(rem.text)).join('\n');
    }

    const prompt = `${explanationPrompt}${text}\n\nKnowledge Base:\n${kbContent}`;

    const response = await gemini.generateContent({
      model: geminiModel,
      prompt: prompt,
    });

    return response.text; 
  } catch (error) {
    plugin.app.toast(
      'Error communicating with Gemini API. Check your API key and settings.',
    );
    console.error('Gemini API Error:', error);
    return 'Error: Could not generate an explanation.';
  }
}

// Function to get flashcards from Gemini API
async function getGeminiCards(
  plugin: ReactRNPlugin,
  text: string,
): Promise<{ front: string; back: string }[]> {
  const apiKey = await plugin.settings.getSetting<string>('gemini-api-key');
  const cardPrompt = await plugin.settings.getStringSetting(
    'card-creation-prompt',
  );
  const kbTag = await plugin.settings.getStringSetting('knowledge-base-tag');
  const geminiModel = await plugin.settings.getDropdownSetting('gemini-model');

  try {
    const gemini = new GoogleGenerativeAI(apiKey);// Pass API key as a string

    // Get knowledge base content
    const kbRems = await plugin.rem.getAllRem();
    const kbContent = kbRems
      .filter((rem) => rem.text && rem.text.includes(kbTag))
      .map((rem) => plugin.richText.toString(rem.text))
      .join('\n');

    const prompt = `${cardPrompt}${text}\n\nKnowledge Base:\n${kbContent}`;

    const response = await gemini.generateText({
      model: geminiModel,
      prompt: prompt,
    });

    // *** Parsing logic - you need to implement this based on how Gemini formats its output ***
    const cards = parseCardsFromGeminiResponse(response.response); // Replace with your actual parsing logic
    return cards;
  } catch (error) {
    plugin.app.toast(
      'Error communicating with Gemini API. Check your API key and settings.',
    );
    console.error('Gemini API Error:', error);
    return [];
  }
}

// Placeholder for parsing logic - replace with your actual implementation
function parseCardsFromGeminiResponse(
  response: string,
): { front: string; back: string }[] {
  // *** Implement your logic to extract front and back of cards from the Gemini response ***
  // ... (Your parsing logic here)
  return [];
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);