const fs = require("fs"),
  Discord = require("discord.js"),
  Collection = Discord.Collection,
  Client = Discord.Client,
  path = require("path");

/***********************
**  DEFAULT FUNCTIONS **
***********************/

const defaults = {
  errorHandler: (error, msg) => {
    console.error(Date());
    if (msg instanceof Discord.Message) {
      console.error(`${msg.author.username} in ${(msg.guild ? (msg.guild.name + " > " + msg.channel.name) : "DM")}: ${msg.cleanContent}`);
    } else if (msg) {
      console.error(msg);
    }
    console.error(error);
  },
  parse: (msg) => {
    let message = msg.content;
    let prefix = msg.client.config.prefix || "!";
    let parse;

    if (msg.author.bot) return;
    else if (message.startsWith(prefix)) parse = prefix.length;
    else if (message.startsWith(`<@${msg.client.user.id}>`)) parse = (`<@${msg.client.user.id}>`).length;
    else if (message.startsWith(`<@!${msg.client.user.id}>`)) parse = (`<@!${msg.client.user.id}>`).length;
    else return;

    parse = message.slice(parse).trim().split(" ");
    let [command, ...suffix] = parse;

    return {
      command: command.toLowerCase(),
      suffix: suffix.join(" ")
    };
  }
};

/***************
**  HANDLERS  **
***************/

class ClockworkHandler extends Collection {
  constructor(client) {
    super();
    this.client = client;
  }

  register(load) {
    if (load.clockwork) this.set(load.filepath, load.clockwork());
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

class CommandHandler extends Collection {
  constructor(client) {
    super();
    this.client = client;
    this.aliases = new Collection();
    this.commandCount = 0;
  }

  async execute(command, msg, suffix) {
    try {
      let commandGroup;
      if (this.has(command)) commandGroup = this;
      else if (this.aliases.has(command)) commandGroup = this.aliases;
      else return;

      this.commandCount++;
      return commandGroup.get(command).execute(msg, suffix);
    } catch(e) {
      return this.client.errorHandler(e, msg);
    }
  }

  register(load) {
    for (const command of load.commands) {
      try {
        command.file = load.filepath;
        if (!this.has(command.name.toLowerCase()))
          this.set(command.name.toLowerCase(), command);
        if (command.aliases.length > 0) {
          for (let alias of command.aliases.filter(a => !this.aliases.has(a.toLowerCase()))) {
            this.aliases.set(alias.toLowerCase(), command);
          }
        }
      } catch(e) {
        this.client.errorHandler(e, `Register command "${command.name}" in ${load.filepath}`);
      }
    }
    return this;
  }
}

class EventHandler extends Collection {
  constructor(client) {
    super();
    this.client = client;
  }

  register(load) {
    if (load.events && (load.events.size > 0)) {
      for (const [event, handler] of load.events) {
        if (!this.has(event)) this.set(event, new Collection([[load.filepath, handler]]));
        else this.get(event).set(load.filepath, handler);
      }
    }
    return this;
  }
}

class ModuleHandler {
  constructor(client) {
    this.client = client;
    this.clockwork = new ClockworkHandler(client);
    this.commands = new CommandHandler(client);
    this.events = new EventHandler(client);
    this.unloads = new Map();

    client.clockwork = this.clockwork;
    client.commands = this.commands;
    client.events = this.events;
  }

  register(file, data) {
    if (file) {
      try {
        let filepath = path.resolve(file);
        const load = require(filepath);

        load.config = this.client.config;
        load.db = this.client.db;
        load.client = this.client;
        load.filepath = filepath;

        // REGISTER COMMANDS & ALIASES
        this.commands.register(load);

        // REGISTER EVENT HANDLERS
        this.events.register(load);

        // REGISTER CLOCKWORK
        this.clockwork.register(load);

        // RUN INIT()
        if (load.init) load.init(data);

        // REGISTER UNLOAD FUNCTION
        if (load.unload) this.unloads.set(filepath, load.unload);
      } catch(e) {
        this.client.errorHandler(e, "Register: " + file);
      }
    }
    return this;
  }

  reload(file) {
    if (file) {
      let filepath = path.resolve(file);
      let unloadData;
      try {
        unloadData = this.unload(filepath);
        this.register(filepath, unloadData);
      } catch(error) {
        this.client.errorHandler(error, "Reload: " + file);
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

        // Unload
        let unloadData;
        if (this.unloads.has(filepath)) {
          unloadData = this.unloads.get(filepath)();
          this.unloads.delete(filepath);
        }

        // Clear Commands and Aliases
        this.commands = this.commands.filter(c => c.file != filepath);
        this.commands.aliases = this.commands.aliases.filter(a => a.file != filepath);

        // Clear require cache
        delete require.cache[require.resolve(filepath)];

        return unloadData;
      } catch(error) {
        this.client.errorHandler(error, "Unload: " + file);
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
    // Unload all files
    for (const [file, unload] of this.unloads) {
      try {
        await unload();
      } catch(error) {
        this.client.errorHandler(error, "Unload: " + file);
      }
    }
  }
}

/*******************
**  AUGUR CLIENT  **
*******************/

class AugurClient extends Client {
  constructor(config, options = {}) {
    const calculateIntents = require("./intents");
    const intents = calculateIntents(config.events, config.processDMs);

    if (!options.clientOptions) options.clientOptions = {"ws": { intents }};
    else if (!options.clientOptions.ws) options.clientOptions.ws = { intents };
    else if (!options.clientOptions.ws.intents) options.clientOptions.ws.intents = intents;

    super(options.clientOptions);

    this.moduleHandler = new ModuleHandler(this);

    this.augurOptions = options;
    this.config = config;
    this.db = ((this.config.db && this.config.db.model) ? require(path.resolve(__dirname, this.config.db.model)) : null);

    this.errorHandler = this.augurOptions.errorHandler || defaults.errorHandler;
    this.parse = this.augurOptions.parse || defaults.parse;

    // PRE-LOAD COMMANDS
    if (this.augurOptions && this.augurOptions.commands) {
      const fs = require("fs");
      let commandPath = path.resolve(__dirname, this.augurOptions.commands);
      try {
        let commandFiles = fs.readdirSync(commandPath).filter(f => f.endsWith(".js"));
        for (let command of commandFiles) {
          try {
            this.moduleHandler.register(path.resolve(commandPath, command));
          } catch(e) { this.errorHandler(e, `Error loading Augur Module ${command}`); }
        }
      } catch(e) { this.errorHandler(e, `Error loading module names from ${commandPath}`); }
    }

    // SET EVENT HANDLERS
    this.on("ready", async () => {
      console.log(this.user.username + (this.shard ? ` Shard ${this.shard.id}` : "") + " ready at:", Date());
      console.log(`Listening to ${this.channels.cache.size} channels in ${this.guilds.cache.size} servers.`);

      if (this.events.has("ready")) {
        for (let [file, handler] of this.events.get("ready")) {
          halt = await handler();
          if (halt) break;
        }
      }
    });

    this.on("message", async (msg) => {
      try {
        let halt = false;
        if (this.events.has("message")) {
          for (let [file, handler] of this.events.get("message")) {
            halt = await handler(msg);
            if (halt) break;
          }
        }
        let parse = await this.parse(msg);
        if (parse && !halt) this.commands.execute(parse.command, msg, parse.suffix);
      } catch(error) {
        this.errorHandler(error, msg);
      }
    });

    this.on("messageUpdate", async (old, msg) => {
      try {
        if (old.content === msg.content) return;
        let halt = false;
        if (this.events.has("messageUpdate")) {
          for (let [file, handler] of this.events.get("messageUpdate")) {
            halt = await handler(old, msg);
            if (halt) break;
          }
        }
        let parse = await this.parse(msg);
        if (parse && !halt) this.commands.execute(parse.command, msg, parse.suffix);
      } catch(error) {
        this.errorHandler(error, msg);
      }
    });

    let events = this.config.events.filter(event => !["message", "messageUpdate", "ready"].includes(event));

    for (let event of events) {
      this.on(event, async (...args) => {
        try {
          if (this.events.has(event) && this.events.get(event).length > 0) {
            for (let [file, handler] of this.events.get(event)) {
              if (await handler(...args)) break;
            }
          }
        } catch(error) { this.errorHandler(error, event + " handler."); }
      });
    }
  }

  destroy() {
    this.moduleHandler.unloadAll()
    .catch(error => this.errorHandler(error, "Unload prior to destroying client."));
    return super.destroy();
  }

  login(token) {
    return super.login(token || this.config.token);
  }
}

/***********************
**  MODULE CONTAINER  **
***********************/

class Module {
  constructor() {
    this.commands = [];
    this.events = new Collection();
    this.clockwork = undefined;
    this.unload = undefined;
    this.config = {};
  }

  addCommand(info) {
    this.commands.push(new Command(info));
    return this;
  }

  addEvent(name, handler) {
    this.events.set(name, handler);
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

class Command {
  constructor(info, client) {
    if (!info.name || !info.process) {
      throw(new Error("Commands must have the name and process properties."));
    }
    this.name = info.name;
    this.aliases = info.aliases || [];
    this.syntax = info.syntax || "";
    this.description = info.description || (this.name + " " + this.syntax).trim();
    this.info = info.info || this.description;
    this.hidden = info.hidden || false;
    this.category = info.category || "General";
    this.permissions = info.permissions || (() => true);
    this.process = info.process;
    this.file = undefined;

    if (client) this.client = client;
  }

  async execute(msg, suffix) {
    try {
      if (await this.permissions(msg)) return await this.process(msg, suffix);
      else return;
    } catch(error) {
      this.client.errorHandler(error, msg);
    }
  }
}

/**************
**  EXPORTS  **
**************/

module.exports = {AugurClient, Module};
