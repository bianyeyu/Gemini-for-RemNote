import { usePlugin, renderWidget, useTracker } from '@remnote/plugin-sdk';
import { GoogleGenerativeAI, Content } from '@google/generative-ai';
import React, { useState } from 'react';

export const SampleWidget = () => {
  const plugin = usePlugin();
  const [chatHistory, setChatHistory] = useState<Content[]>([]);

  const apiKey = useTracker(() => plugin.settings.getSetting<string>('gemini-api-key'));
  const geminiModel = useTracker(() => plugin.settings.getSetting<string>('gemini-model'));

  const handleClearChat = () => {
    setChatHistory([]);
  };

  const handleSaveChat = () => {
    if (chatHistory.length === 0) {
      plugin.app.toast('Chat history is empty!');
      return;
    }

    let chatText = '';
    chatHistory.forEach(message => {
      chatText += `${message.role.toUpperCase()}: ${message.parts[0].text}\n`;
    });

    // Create a Blob object from the chat text
    const blob = new Blob([chatText], { type: 'text/plain' });

    // Create a temporary URL for the Blob
    const url = URL.createObjectURL(blob);

    // Create a hidden <a> element to trigger the download
    const link = document.createElement('a');
    link.href = url;
    link.download = 'gemini-chat.txt';
    document.body.appendChild(link);

    // Trigger the download
    link.click();

    // Clean up
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    plugin.app.toast('Chat history saved!');
  };

  const handleUserInput = async (userInput: string) => {
    if (!apiKey) {
      plugin.app.toast('Please enter your Gemini API key in the settings.');
      return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: geminiModel });

    try {
      if (userInput.startsWith('/')) {
        // Execute slash command
        const commandResponse = await plugin.app.executeCommand(userInput.substring(1));
        if (commandResponse) {
          // Update chatHistory with the response from the slash command
          setChatHistory(prevHistory => [
            ...prevHistory,
            { role: 'model', parts: [{ text: commandResponse }] }, 
          ]);
        }
      } else {
        // Regular chat input 
        const chat = model.startChat({
          history: chatHistory,
          generationConfig: {
            maxOutputTokens: 100, 
          },
        });
        const result = await chat.sendMessage(userInput);
        const response = await result.response;
        const text = response.text();

        setChatHistory(prevHistory => [
          ...prevHistory,
          { role: 'model', parts: [{ text: text }] },
        ]);
      }
    } catch (error) {
      plugin.app.toast('Error communicating with Gemini API.');
      console.error('Gemini API Error:', error);
    }
  };

  // Placeholder token counting function
  const getTokenCount = () => {
    return Math.floor(Math.random() * 1000);
  };

  return (
    <div className="p-2 m-2 rounded-lg rn-clr-background-light-positive rn-clr-content-positive">
      <h1 className="text-xl">Gemini for RemNote</h1>
      <div>Token Count: {getTokenCount()}</div>

      <div className="chat-history">
    {chatHistory.map((message, index) => (
      <div key={index} className={`chat-message ${message.role}`}>
        {message.parts[0].text}  {/* Accessing text correctly */}
      </div>
    ))}
  </div>

      <input
        type="text"
        className="user-input"
        placeholder="Type your message..."
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            handleUserInput(event.currentTarget.value);
            event.currentTarget.value = '';
          }
        }}
      />

      <div className="button-container">
        <button onClick={handleClearChat}>Clear</button>
        <button onClick={handleSaveChat}>Save</button>
      </div>
    </div>
  );
};

renderWidget(SampleWidget);