## Augur - Discord bot framework

Augur is a Discord bot framework, utilizing the `discord.js` library.

### Change Log

As of version 3.0.0, Augur uses Discord.js v13.1+ and requires Node 16.6+.

2.3.0 introduces several new features:
* AugurCommand.parseParams
* AugurCommand.options
* AugurInteractionCommand
* AugurModule.addInteraction()
* DiscordInteraction
* DiscordInteractionResponse
* ModuleManager.InteractionManager

2.0.1 automatically unloads all modules prior to executing `client.destroy()`.

2.0.8 includes various bugfixes.

### Installation

`npm install --save augurbot discord.js`

---

## The Augur Client

Within your base file, require `augurbot` and create a new instance of `AugurClient`:
```
const {AugurClient} = require("augurbot");
const client = new AugurClient(config, options);

client.login();
```

The AugurClient will create the Discord Client, log it in using the token provided in `config.token`, listen for events, and process commands. Any gateway intents are automatically calculated based on `config.events`.

### The `config` Object

Minimum required properties in `config` include:

* `events` (array): An array of discord.js events to process, including `message` and `messageUpdate`, if your bot will be processing message commands. Gateway intents will be automatically calculated based on the `events` supplied.

Additional optional properties include:

* `db` (object): An object, including a `model` property which is the path to your database model, relative to the base file.

* `prefix` (string): A default prefix for commands. Defaults to `!`.

* `processDMs` (boolean): Whether to process messages in DMs. Defaults to `true`.

* `token` (string): Your bot's Discord token to log in. If provided in the `config` object, it does not need to be passed when `client.login()` is called. If omitted, it *must* be passed with `client.login(token)` when logging in.

* Any other properties you wish to be able to access from your command modules.

### The `options` Object

The `options` object is optional, but may include:

* `clientOptions` (object): An object containing options to be passed to the new Discord.Client(). Gateway intents are automatically calulated based on `config.events`. If you would like to override the calculated intents, provide your own intents as usual for Discord.js.

* `commands` ([string]): A directory, relative to the base file, containing any command modules you wish to automatically load. Optionally, an array of directories may be provided.

* `errorHandler`: A function accepting `error` and `message` as its arguments. This will replace the default error handling function.

* `interactionFailed`: A function accepting an `interaction` and an optional `handlerMissing` flag as its arguments. This will replace the default "handler missing" and "missing permissions" function.

* `parse` (async function): An asynchronous function accepting `message` as its argument, returning an object with `command` and `suffix` properties. This will replace the default parsing function. (Useful in case different servers use different prefixes, for example.)

### AugurClient Properties

Properties of the AugurClient class:

* `augurOptions` (object): The options object passed to the client upon initialization.

* `clockwork` (ClockworkManager extends Collection):

  A collection of functions to be run by an interval.
  * `register(AugurModule)`: Registers clockwork functions from a Module. Automatically called by `client.moduleHandler.register(AugurModule)`.
  * `unload(filepath)`: Unload a clockwork function from memory. Automatically called by `client.moduleHandler.unload(filepath)`.

* `commands` (CommandManager extends Collection):

  A collection of commands, keyed by command name.
  * `aliases` (Collection): Collection of commands, keyed by alias.
  * `commandCount` (Number): Integer of how many commands have been executed via `commands.execute()`.
  * `execute(commandName, message, suffix)` (async function): Execute a command function. Automatically called by the event handler.
  * `register(AugurModule)` (function): Registers commands from a Module. Automatically called by `client.moduleHandler.register(AugurModule)`.

* `config`: The `config` object passed to the AugurClient.

* `db`: Your loaded database model.

* `events` (EventManager extends Collection):

  A collection of event handlers, keyed by event then keyed by filepath.
  * `register(AugurModule)`: Registers event handlers from a Module. Automatically called by `client.moduleHandler.register(AugurModule)`.

* `interactions` (InteractionManager):
  **NOTE:** As of Augur 3.0.0, Augur does *not* handle creating the data object to create or edit an interaction. See the [Discord Developer Portal](https://discord.com/developers/docs/interactions/slash-commands#registering-a-command) for details on the data object required to register a command.
  * `commands` (Collection): Collection of interaction command handlers, keyed by interaction id.
  * `handlers` (Collection): Collection of custom interaction command handlers (e.g. buttons or select menus), keyed by interaction id.
  * `clearCustomHandler(customId)` (function): Removes a handler for interactions with custom interactions (e.g. buttons or select menus).
  * `register(AugurModule)` (function): Registers interaction commands from a Module. Automatically called by `client.moduleHandler.register(AugurModule)`.
  * `setCustomHandler(customId, handler)` (function): Registers a handler for interactions with custom interactions (e.g. buttons or select menus).

* `moduleHandler` (ModuleManager):

  Helper methods for loading/unloading/reloading Augur AugurModules.
  * `register(AugurModule, data)`: Register the module with optional data.
  * `reload(filepath)`: Reload a module from a filepath, reregistering the module with data supplied by the command's `.unload()` method.
  * `unload(filepath)`: Unload a module from memory.

### AugurClient Methods

Methods of the AugurClient class:

* `errorHandler(error, message)`: Error handling function.

* `parse(message)`: Parse a message into its command name and suffix. Returns an object containing `command` (string) and `suffix` (string).

---

## Command File Structure

The basic file structure:
```
const Augur = require("augurbot");
const Module = new Augur.Module();

// Add commands, interactions, event handlers, etc. as necessary.

module.exports = Module;
```

In between, you can add one or more commands and event handlers, as well as a clockwork and unload function.

`Module` properties include:

* `config`: Contents of the config object loaded with the AugurClient.

* `db`: The loaded database model.

* `client`: The Augur client which loaded the command module.

All of the following methods are chainable:

### Clockwork
The function passed to the `.setClockwork()` method should return an interval which will continue to run in the background. The interval is cleared and reloaded when the module is reloaded. Note that the clockwork function is run *after* the intialization function.
```
Module.setClockwork(function() {
  return setInterval();
});
```

### Commands
The `.addCommand()` method defines a new bot command.
```
Module.addCommand({
  name: "commandname",
  process: async (msg, suffix) => {},
  aliases: [],
  category: "",
  description: "",
  enabled: true,
  hidden: false,
  info: "",
  options: {},
  parseParams: false,
  permissions: async (msg) => {},
  syntax: ""
});
```
* `name` (string): Required. A string for the name of the command.
* `process` (function): Required. The function to run when the command is invoked. This accepts either:
  * If `parseParams` is `false`, (message, suffix); a `Discord.Message` object and a `suffix` string of the remainder of the command supplied by the user; or
  * If `parseParams` is `true`, (message, ...params); a `Discord.Message` object and a list of parameters suppried by the user.
* `aliases` (array of strings): An array of strings that can can be used as alternate names for the command.
* `category` (string): A category name, for convenience in organizing commands. Defaults to the filename of the module.
* `description` (string): A short string for a brief overview of the command.
* `enabled` (boolean): Whether the command is able to run. Defaults to `true`.
* `hidden` (boolean): A boolean for whether you want to hide the command in your help functions. Defaults to `false`.
* `info` (string): A longer string with more details about the command's usage.
* `options` (object): An object of custom options that the developer may wish to use (e.g. in parsing messages).
* `parseParams` (boolean): Determines whether to split the command suffix before passing the parameters to the `process` function. Defaults to `false`.
* `permissions` (function): A function used to determine whether the user has permission to run the command. Accepts a `Discord.Message` object.
* `syntax` (string): A string describing command syntax.

### Events
The `.addEvent()` method adds an event handler for the various Discord.js events.
```
Module.addEvent("eventName", function(...args) {});
```

### Interactions
The `.addInteraction()` method defines an interaction for slash commands.
```
Module.addInteraction({
  id: "interactionId",
  process: async (interaction) => {},
  category: "",
  description: "",
  enabled: true,
  hidden: false,
  info: "",
  name: "slashCommandName",
  options: {},
  permissions: async (interaction) => {},
  syntax: ""
});
```
* `id` (string): Required. The interaction ID for the slash command.
* `process` (function): Required. The function to run when the slash command is invoked. This accepts a DiscordInteraction object.
* `category` (string): A category name, for convenience in organizing slash commands. Defaults to the filename of the module.
* `description` (string): A short string for a brief overview of the slash command.
* `enabled` (boolean): Whether the slash command is able to run. Defaults to `true`.
* `hidden` (boolean): A boolean for whether you want to hide the slash command in your help functions. Defaults to `false`.
* `info` (string): A longer string with more details about the slash command's usage.
* `name`  (string): The name of the slash command.
* `options` (object): An object of custom options that the developer may wish to use (e.g. in parsing messages).
* `permissions` (function): A function used to determine whether the user has permission to run the slash command. Accepts a `DiscordInteraction` object.
* `syntax` (string): A string describing command syntax.

### Initialization
The `.setInit(data)` method accepts a function to run on module initialization. The `data` parameter will have a `null` value on the first run, and will contain the returned by the function defined with the `.setUnload()` method on subsequent reloads of the module.
```
Module.setInit(function(data) {});
```

### Unloading
The function passed to the `.setUnload()` method will be run when unloading or reloading the module.
```
Module.setUnload(function() {});
```

## Supplemental Classes
As of Augur 2.3.0, Discord.js does not yet support interactions (slash commands). Once Discord.js supports interactions, the following will likely be removed in favor of official library support. As a temporary fix, the following classes are used within Augur to facilitate slash command use:

### DiscordInteraction
A `DiscordInteraction` represents the data object provided by the Discord API on the `interactionCreate` event. See the [Discord Developer Portal](https://discord.com/developers/docs/interactions/slash-commands#interaction) for additional information. Properties and methods include:
* `client` (AugurClient): The Client that received the interaction.
* `id` (snowflake): id of the interaction
* `type` (InteractionType): the type of the interaction
* `data` (ApplicationCommandInteractionData): the command data payload
* `name` (string): the name of the interaction being used, found in `.data.name`
* `commandId` (snowflake): the id of the interaction being used, found in `.data.id`
* `options` (array): options found in `.data.options`
* `guild` (Discord.Guild): the Guild object representing the Guild where the command was run, if found
* `channel` (Discord.Channel): the Channel object representing the Channel where the command was run, if found
* `member` (Discord.GuildMember): the GuildMember object representing the member running the command, if in a Guild
* `user` (Discord.User): the User object representing the user running the command, if found
* `token` (string): a continuation token for responding to the interaction
* `version` (int) always `1`
* `deferred` (boolean): whether the interaction has been "deferred" and waiting for a full response.

* `defer()`: Defers the interaction response
* `createResponse(content, options)`: Creates an initial response or edits a deferred response.
* `createFollowup(content, options)`: Creates a followup response.
* `deleteResponse(response)`: Deletes the identified interaction response, deleting the original response if no response/id is passed to the method.
* `editResponse(content, options, response)`: Edits the identified interaction response, editing the original response if no response/id is passed to the method.

### DiscordInteractionResponse extends Discord.Message
* `interaction` (DiscordInteraction): The interaction to which the response is related.
* `followup(content, options)`: Convenience method calling `DiscordInteraction.createFollowup(content, options)`.
