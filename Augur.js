const fs = require("fs"),
  Discord = require("discord.js"),
  {Collection, Client, Message} = require("discord.js"),
  path = require("path");

/************************
**  DEFAULT FUNCTIONS  **
************************/

const DEFAULTS = {
  errorHandler: (error, msg) => {
    console.error(Date());
    if (msg instanceof Message) {
      console.error(`${msg.author.username} in ${(msg.guild ? (`${msg.guild.name} > ${msg.channel.name}`) : "DM")}: ${msg.cleanContent}`);
    } else if (msg) {
      console.error(msg);
    }
    console.error(error);
  },
  interactionFailed: async (interaction, reason) => {
    try {
      let content;
      switch (reason) {
        case "HALTED":
          content = "Something halted processing of this interaction.";
          break;
        case "HANDLER_MISSING":
          content = "I don't know how to handle that!";
          break;
        case "PERMISSIONS_MISSING":
          content = "You don't have permission to do that!";
          break;
        default:
      }
      if (content) {
        await interaction.reply({content, ephemeral: true});
      }
    } catch(error) {
      interaction.client.errorHandler(error, `Interaction Failed Message. (\`reason\`: \`${reason}\`)${interaction.commandId ? ` (\`commandId\`: \`${interaction.commandId}\`)` : ""}${interaction.customId ? ` (\`customId\`: \`${interaction.customId}\`)` : ""}`);
    }
  },
  parse: (msg) => {
    let content = msg.content;
    let setPrefix = msg.client.config.prefix || "!";
    if (msg.author.bot) return null;
    for (let prefix of [setPrefix, `<@${msg.client.user.id}>`, `<@!${msg.client.user.id}>`]) {
      if (!content.startsWith(prefix)) continue;
      let trimmed = content.substr(prefix.length).trim();
      let [command, ...params] = content.substr(prefix.length).split(" ");
      if (command) {
        return {
          command: command.toLowerCase(),
          suffix: params.join(" "),
          params
        };
      }
    }
    return null;
  }
};

function wait(t) {
  return new Promise((fulfill, reject) => {
    setTimeout(fulfill, t);
  });
}

async function fetchPartial(obj) {

}

/***************
**  MANAGERS  **
***************/

class ClockworkManager extends Collection {
  constructor(client) {
    super();
    this.client = client;
  }

  register(load) {
    if (load.clockwork) this.set(load.file, load.clockwork());
    return this;
  }

  unload(filepath) {
    if (this.has(filepath)) {
      clearInterval(this.get(filepath));
      this.delete(filepath);
    }
    return this;
  }
}

class CommandManager extends Collection {
  constructor(client) {
    super();
    this.client = client;
    this.aliases = new Collection();
    this.commandCount = 0;
  }

  async execute(msg, parsed) {
    try {
      let {command, suffix, params} = parsed;
      let commandGroup;
      if (this.has(command)) commandGroup = this;
      else if (this.aliases.has(command)) commandGroup = this.aliases;
      else return;

      this.commandCount++;
      let cmd = commandGroup.get(command);
      if (cmd.parseParams)
        return cmd.execute(msg, ...params);
      else
        return cmd.execute(msg, suffix);
    } catch(error) {
      return this.client.errorHandler(error, msg);
    }
  }

  register(load) {
    for (const command of load.commands) {
      try {
        command.file = load.file;
        command.client = load.client;
        if (!command.category) command.category = path.basename(command.file, ".js");

        if (!this.has(command.name.toLowerCase()))
          this.set(command.name.toLowerCase(), command);
        if (command.aliases.length > 0) {
          for (let alias of command.aliases.filter(a => !this.aliases.has(a.toLowerCase())))
            this.aliases.set(alias.toLowerCase(), command);
        }
      } catch(error) {
        this.client.errorHandler(error, `Register command "${command.name}" in ${load.file}`);
      }
    }
    return this;
  }
}

class EventManager extends Collection {
  constructor(client) {
    super();
    this.client = client;
  }

  register(load) {
    if (load.events?.size > 0) {
      for (const [event, handler] of load.events) {
        if (!this.has(event)) this.set(event, new Collection([[load.file, handler]]));
        else this.get(event).set(load.file, handler);
      }
    }
    return this;
  }
}

class InteractionManager {
  constructor(client) {
    this.commands = new Collection();
    this.handlers = new Collection();
    this.client = client;
  }

  clearCustomHandler(customId) {
    this.handlers.delete(customId);
    return this;
  }

  register(load) {
    for (const interaction of load.interactionCommands) {
      try {
        interaction.file = load.file;
        if (this.commands.has(interaction.commandId)) this.client.errorHandler(`Duplicate Interaction Id: ${interaction.commandId}`, `Interaction id ${interaction.commandId} already registered in \`${this.commands.get(interaction.commandId).file}\`. It is being overwritten.`);
        this.commands.set(interaction.commandId, interaction);
      } catch(error) {
        this.client.errorHandler(error, `Register interaction "${interaction.name}" in guild ${interaction.guild} in ${load.file}`);
      }
    }
    for (const handler of load.interactionHandlers) {
      try {
        handler.file = load.file;
        if (this.handlers.has(handler.customId)) this.client.errorHandler(`Duplicate Interaction Custom Id: ${handler.customId}`, `Interaction Custom Id ${handler.customId} already registered in \`${this.handlers.get(handler.customId).file}\`. It is being overwritten.`);
        this.handlers.set(handler.customId, handler);
      } catch(error) {
        this.client.errorHandler(error, `Register Interaction Custom Id "${handler.customId}" in ${load.file}`);
      }
    }
    return this;
  }

  setCustomHandler(customId, handler) {
    this.handlers.set(customId, handler);
    return this;
  }
}

class ModuleManager {
  constructor(client) {
    this.client = client;
    this.clockwork = new ClockworkManager(client);
    this.commands = new CommandManager(client);
    this.events = new EventManager(client);
    this.interactions = new InteractionManager(client);
    this.unloads = new Map();

    client.clockwork = this.clockwork;
    client.commands = this.commands;
    client.events = this.events;
    client.interactions = this.interactions;
  }

  register(file, data) {
    if (file) {
      let filepath = path.resolve(file);
      try {
        const load = require(filepath);

        load.config = this.client.config;
        load.db = this.client.db;
        load.client = this.client;
        load.file = filepath;

        // REGISTER COMMANDS & ALIASES
        this.commands.register(load);

        // REGISTER EVENT HANDLERS
        this.events.register(load);

        // REGISTER CLOCKWORK
        this.clockwork.register(load);

        // REGISTER INTERACTIONS
        this.interactions.register(load);

        // RUN INIT()
        load.init?.(data);

        // REGISTER UNLOAD FUNCTION
        if (load.unload) this.unloads.set(filepath, load.unload);
      } catch(error) {
        this.client.errorHandler(error, `Register: ${filepath}`);
      }
    }
    return this;
  }

  reload(file) {
    if (file) {
      let filepath = path.resolve(file);
      try {
        let unloadData = this.unload(filepath);
        this.register(filepath, unloadData);
      } catch(error) {
        this.client.errorHandler(error, `Reload: ${filepath}`)
      }
    }
    return this;
  }

  unload(file) {
    if (file) {
      let filepath = path.resolve(file);
      try {
        // Clear Clockwork
        this.clockwork.unload(filepath);

        // Clear Event Handlers
        for (let [event, handlers] of this.events) {
          handlers.delete(filepath);
        }

        // Clear Interaction Handlers
        for (let [interactionId, interaction] of this.interactions.commands) {
          if (interaction.file == filepath) this.interactions.commands.delete(interactionId);
        }
        for (let [customId, handler] of this.interactions.handlers) {
          if (handler.file == filepath) this.interactions.handlers.delete(customId);
        }

        // Unload
        let unloadData;
        if (this.unloads.has(filepath)) {
          unloadData = this.unloads.get(filepath)();
          this.unloads.delete(filepath);
        }

        // Clear Commands and Aliases
        for (let [name, command] of this.commands) {
          if (command.file == filepath) this.commands.delete(name);
        }
        for (let [alias, command] of this.commands.aliases) {
          if (command.file == filepath) this.commands.aliases.delete(alias);
        }

        // Clear Require Cache
        delete require.cache[require.resolve(filepath)];

        return unloadData;
      } catch(error) {
        this.client.errorHandler(error, `Unload: ${filepath}`);
      }
    }
    return this;
  }

  async unloadAll() {
    // Remove all clockwork intervals
    for (const [file, interval] of this.clockwork) {
      clearInterval(interval);
      this.clockwork.delete(file);
    }

    // Clear Event Handlers
    for (let [event, handlers] of this.events) {
      handlers.clear();
    }

    // Unload all files
    for (const [file, unload] of this.unloads) {
      try {
        await unload();
      } catch(error) {
        this.client.errorHandler(error, `Unload: ${file}`);
      }
    }

    // Clear Commands and Aliases
    this.commands.clear();
    this.commands.aliases.clear();

    // Clear Interactions
    this.interactions.commands.clear();
    this.interactions.handlers.clear();

    return this;
  }
}

/*******************
**  AUGUR CLIENT  **
*******************/

class AugurClient extends Client {
  constructor(config, options = {}) {
    const calculateIntents = require("./intents");
    const intents = calculateIntents(config.events, config.processDMs);

    if (!options.clientOptions) options.clientOptions = { intents };
    else if (!options.clientOptions.intents) options.clientOptions.intents = intents;

    super(options.clientOptions);

    this.moduleHandler = new ModuleManager(this);

    this.augurOptions = options;
    this.config = config;
    this.db = (this.config.db?.model ? require(path.resolve((require.main ? path.dirname(require.main.filename) : process.cwd()), this.config.db.model)) : null);
    this.errorHandler = this.augurOptions.errorHandler || DEFAULTS.errorHandler;
    this.interactionFailed = this.augurOptions.interactionFailed || DEFAULTS.interactionFailed;
    this.parse = this.augurOptions.parse || DEFAULTS.parse;

    // PRE-LOAD COMMANDS
    if (this.augurOptions?.commands) {
      const fs = require("fs");
      if (!Array.isArray(this.augurOptions.commands)) this.augurOptions.commands = [this.augurOptions.commands];
      for (let commandPath of this.augurOptions.commands) {
        commandPath = path.resolve(require.main ? path.dirname(require.main.filename) : process.cwd(), commandPath);
        try {
          let commandFiles = fs.readdirSync(commandPath).filter(f => f.endsWith(".js"));
          for (let command of commandFiles) {
            try {
              this.moduleHandler.register(path.resolve(commandPath, command));
            } catch(error) {
              this.errorHandler(error, `Error loading Augur Module ${command}`);
            }
          }
        } catch(error) {
          this.errorHandler(error, `Error loading module names from ${commandPath}`);
        }
      }
    }

    // SET EVENT HANDLERS
    this.on("ready", async () => {
      console.log(`${this.user.username} ${(this.shard ? ` Shard ${this.shard.id}` : "")} ready at: ${Date()}`);
      console.log(`Listening to ${this.channels.cache.size} channels in ${this.guilds.cache.size} servers.`);
      if (this.events.has("ready")) {
        for (let [file, handler] of this.events.get("ready")) {
          try {
            if (await handler()) break;
          } catch(error) {
            this.errorHandler(error, `Ready Handler: ${file}`);
          }
        }
      }
    });

    this.on("messageCreate", async (msg) => {
      let halt = false;
      if (this.events.has("messageCreate")) {
        if (msg.partial) {
          try {
            await msg.fetch();
          } catch(error) {
            this.errorHandler(error, "Augur Fetch Partial Message Error");
          }
        }
        for (let [file, handler] of this.events.get("messageCreate")) {
          try {
            halt = await handler(msg);
            if (halt) break;
          } catch(error) {
            this.errorHandler(error, msg);
            halt = true;
            break;
          }
        }
      }
      try {
        let parsed = await this.parse(msg);
        if (parsed && !halt) this.commands.execute(msg, parsed);
      } catch(error) {
        this.errorHandler(error, msg);
      }
    });

    this.on("messageUpdate", async (old, msg) => {
      if (old.content === msg.content) return;
      let halt = false;
      if (this.events.has("messageUpdate")) {
        if (msg.partial) {
          try {
            await msg.fetch();
          } catch(error) {
            this.errorHandler(error, "Augur Fetch Partial Message Update Error");
          }
        }
        for (let [file, handler] of this.events.get("messageUpdate")) {
          try {
            halt = await handler(old, msg);
            if (halt) break;
          } catch(error) {
            this.errorHandler(error, msg);
            halt = true;
            break;
          }
        }
      }
      try {
        let parsed = await this.parse(msg);
        if (parsed && !halt) this.commands.execute(msg, parsed);
      } catch(error) {
        this.errorHandler(error, msg);
      }
    });

    this.on("interactionCreate", async (interaction) => {
      let halt = false;
      if (this.events.has("interactionCreate")) {
        for (let [file, handler] of this.events.get("interactionCreate")) {
          try {
            halt = await handler(interaction);
            if (halt) break;
          } catch(error) {
            this.errorHandler(error, `interactionCreate Handler: ${file}`);
            break;
          }
        }
      }
      try {
        if (!halt && (interaction.isCommand() || interaction.isContextMenu())) {
          // Run Commands and Context Menus
          let command = this.interactions.commands.get(interaction.commandId);
          if (command) await command.execute(interaction);
          else interaction.client.interactionFailed(interaction, "HANDLER_MISSING");
        } else if (!halt) {
          // Handle Buttons and Select Menus
          this.interactions.handlers.get(interaction.customId)?.execute(interaction);
        } else {
          interaction.client.interactionFailed(interaction, "HALTED");
        }
      } catch(error) {
        this.errorHandler(error, interaction);
      }
    });

    if (this.config.events.includes("messageReactionAdd")) {
      this.on("messageReactionAdd", async (reaction, user) => {
        if (this.events.get("messageReactionAdd")?.size > 0) {
          if (reaction.partial) {
            try {
              await reaction.fetch();
            } catch(error) {
              this.errorHandler(error, "Augur Fetch Partial Message Reaction Error");
            }
          }
          if (reaction.message?.partial) {
            try {
              await reaction.message.fetch();
            } catch(error) {
              this.errorHandler(error, "Augur Fetch Partial Reaction.Message Error");
            }
          }
          for (let [file, handler] of this.events.get("messageReactionAdd")) {
            try {
              if (await handler(reaction, user)) break;
            } catch(error) {
              this.errorHandler(error, `messageReactionAdd Handler: ${file}`);
              break;
            }
          }
        }
      });
    }

    let events = this.config?.events?.filter(event => !["messageCreate", "messageUpdate", "interactionCreate", "messageReactionAdd", "ready"].includes(event)) || [];

    for (let event of events) {
      this.on(event, async (...args) => {
        if (this.events.get(event)?.size > 0) {
          for (let [file, handler] of this.events.get(event)) {
            try {
              if (await handler(...args)) break;
            } catch(error) {
              this.errorHandler(error, `${event} Handler: ${file}`);
              break;
            }
          }
        }
      });
    }
  }

  async destroy() {
    try {
      await this.moduleHandler.unloadAll()
    } catch(error) {
      this.errorHandler(error, "Unload prior to destroying client.");
    }
    return super.destroy();
  }

  login(token) {
    return super.login(token || this.config?.token);
  }
}

/***********************
**  MODULE CONTAINER  **
***********************/

class AugurModule {
  constructor() {
    this.commands = [];
    this.interactionCommands = [];
    this.interactionHandlers = [];
    this.events = new Collection();
    this.config = {};
  }

  addCommand(info) {
    this.commands.push(new AugurCommand(info));
    return this;
  }

  addEvent(name, handler) {
    this.events.set(name, handler);
    return this;
  }

  addInteractionCommand(info) {
    this.interactionCommands.push(new AugurInteractionCommand(info));
    return this;
  }

  addInteractionHandler(info) {
    this.interactionHandlers.push(new AugurInteractionHandler(info));
    return this;
  }

  setClockwork(clockwork) {
    this.clockwork = clockwork;
    return this;
  }

  setInit(init) {
    this.init = init;
    return this;
  }

  setUnload(unload) {
    this.unload = unload;
    return this;
  }
}

/********************
**  COMMAND CLASS  **
********************/

class AugurCommand {
  constructor(info) {
    if (!info.name || !info.process) {
      throw new Error("Commands must have the `name` and `process` properties");
    }
    this.name = info.name;
    this.aliases = info.aliases ?? [];
    this.syntax = info.syntax ?? "";
    this.description = info.description ?? `${this.name} ${this.syntax}`.trim();
    this.info = info.info ?? this.description;
    this.hidden = info.hidden ?? false;
    this.category = info.category;
    this.enabled = info.enabled ?? true;
    this.permissions = info.permissions ?? (() => true);
    this.parseParams = info.parseParams ?? false;
    this.options = info.options ?? {};
    this.process = info.process;
  }

  async execute(msg, args) {
    try {
      if (this.enabled && await this.permissions(msg)) return await this.process(msg, args);
      else return;
    } catch(error) {
      if (this.client) this.client.errorHandler(error, msg);
      else console.error(error);
    }
  }
}

class AugurInteractionCommand {
  constructor(info) {
    if (!info.commandId || !info.process) {
      throw new Error("Commands must have the `commandId` and `process` properties");
    }
    this.commandId = info.commandId;
    this.name = info.name;
    this.syntax = info.syntax ?? "";
    this.description = info.description ?? `${this.name} ${this.syntax}`.trim();
    this.info = info.info ?? this.description;
    this.hidden = info.hidden ?? false;
    this.category = info.category;
    this.enabled = info.enabled ?? true;
    this.permissions = info.permissions ?? (() => true);
    this.options = info.options ?? {};
    this.process = info.process;
  }

  async execute(interaction) {
    try {
      if (!this.enabled) return;
      if (await this.permissions(interaction)) return await this.process(interaction);
      else return await interaction.client.interactionFailed(interaction, "PERMISSIONS_MISSING");
    } catch(error) {
      interaction.client.errorHandler(error, interaction);
    }
  }
}

class AugurInteractionHandler {
  constructor(info) {
    if (!info.customId || !info.process) {
      throw new Error("Commands must have the `id` and `process` properties");
    }
    this.customId = info.customId;
    this.name = info.name;
    this.once = info.once ?? false;
    this.enabled = info.enabled ?? true;
    this.permissions = info.permissions ?? (() => true);
    this.process = info.process;
  }

  async execute(interaction) {
    try {
      if (!this.enabled) return;
      if (await this.permissions(interaction)) {
        if (this.once) interaction.client.interactions.handlers.delete(this.customId);
        return await this.process(interaction);
      } else {
        return await interaction.client.interactionFailed(interaction, "PERMISSIONS_MISSING");
      }
    } catch(error) {
      interaction.client.errorHandler(error, interaction);
    }
  }
}

/**************
**  EXPORTS  **
**************/

module.exports = {
  AugurClient,
  AugurCommand,
  AugurInteractionCommand,
  AugurModule,
  Module: AugurModule,
  ClockworkManager,
  CommandManager,
  EventManager,
  InteractionManager,
  ModuleManager
};
