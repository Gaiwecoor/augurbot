const fs = require("fs"),
  Discord = require("discord.js"),
  Collection = Discord.Collection,
  path = require("path");

/**********************
**  COMMAND HANDLER  **
**********************/

const Handler = function(config, options = {}) {
  this.aliases = new Collection();
  this.client = new Discord.Client(options.clientOptions);
  this.clockwork = new Collection();
  this.commandCount = 0;
  this.commands = new Collection();
  this.config = config;
  this.db = ((this.config.db && this.config.db.model) ? require(path.resolve(process.cwd(), this.config.db.model)) : null);
  this.events = new Collection();
  this.options = options;
  this.unloadFn = new Collection();

  return this;
};

Handler.prototype.errorHandler = function(error, msg = null) {
  if (this.options.errorHandler) return this.options.errorHandler(error, msg);
  else {
    console.error(Date());
    if (msg) console.error(`${msg.author.username} in ${(msg.guild ? (msg.guild.name + " > " + msg.channel.name) : "DM")}: ${msg.cleanContent}`);
    console.error(error);
  }
};

Handler.prototype.execute = function(command, msg, suffix) {
  try {
    if (this.commands.has(command)) {
      this.commandCount++;
      this.commands.get(command).execute(msg, suffix);
    } else if (this.aliases.has(command)) {
      this.commandCount++;
      this.aliases.get(command).execute(msg, suffix);
    }
  } catch(e) {
    this.errorHandler(e, msg);
  }
};

Handler.prototype.parse = async function(msg) {
  try {
    if (this.options.parse) return await this.options.parse(msg);
    else {
      let message = msg.content;
      let prefix = this.config.prefix;
      let parse;

      if (msg.author.bot) parse = false;
      else if (message.startsWith(prefix)) parse = prefix.length;
      else if (message.startsWith(`<@${msg.client.user.id}>`)) parse = (`<@${msg.client.user.id}>`).length;
      else if (message.startsWith(`<@!${msg.client.user.id}>`)) parse = (`<@!${msg.client.user.id}>`).length;

      if (parse) {
        parse = message.slice(parse).trim().split(" ");
        let command = parse.shift().toLowerCase();
        return {
          command: command,
          suffix: parse.join(" ")
        };
      } else return null;
    }
  } catch(e) {
    this.errorHandler(e, msg);
    return null;
  }
};

Handler.prototype.register = function(file = null, data = null) {
  if (file) {
    try {
      file = path.resolve(file);
      let load = require(file);

      load.config = this.config;
      load.db = this.db;
      load.handler = this;

      // REGISTER COMMANDS & ALIASES
      if (load.commands) {
        load.commands.forEach(command => {
          command.file = file;

          if (!this.commands.has(command.name))
          this.commands.set(command.name, command);

          if (command.aliases.length > 0) {
            command.aliases.filter(a => !this.aliases.has(a)).forEach(alias => {
              this.aliases.set(alias, command);
            });
          }
        });
      }

      // REGISTER EVENT HANDLERS
      if (load.events && (load.events.size > 0)) {
        load.events.forEach((handler, event) => {
          if (!this.events.has(event)) this.events.set(event, [{file: file, handler: handler}]);
          else this.events.get(event).push({file: file, handler: handler});
        });
      }

      // RUN INIT()
      if (load.init) load.init(data);

      // REGISTER CLOCKWORK
      if (load.clockwork) this.clockwork.set(file, load.clockwork());

      // REGISTER UNLOAD FUNCTION
      if (load.unload) this.unloadFn.set(file, load.unload);

    } catch(e) {
      this.errorHandler(e);
    }
  }

  return this;
};

Handler.prototype.reload = function(file = null) {
  if (file) {
    file = path.resolve(file);
    let unloadData = null;

    try {
      unloadData = this.unload(file);
      this.register(file, unloadData);
    }
    catch(e) {
      this.errorHandler(e);
    }
  }

  return this;
};

Handler.prototype.start = function() {
  return new Promise((fulfill, reject) => {
    let Client = this.client;

    Client.on("ready", () => {
      console.log(Client.user.username + (Client.shard ? ` Shard ${Client.shard.id}` : "") + " is ready!");
      console.log(`Listening to ${Client.channels.size} channels in ${Client.guilds.size} servers.`);

      fulfill(this);
    });

    Client.on("message", async (msg) => {
      try {
        let halt = false;
        if (this.events.has("message")) {
          for (let i = 0; i < this.events.get("message").length; i++) {
            halt = await this.events.get("message")[i].handler(msg);
            if (halt) break;
          }
        }
        let parse = await this.parse(msg);
        if (parse && !halt) this.execute(parse.command, msg, parse.suffix);
      } catch(e) {
        this.errorHandler(e, msg);
      }
    });

    Client.on("messageUpdate", async (oldMsg, msg) => {
      try {
        let halt = false;
        if (this.events.has("messageUpdate")) {
          for (let i = 0; i < this.events.get("messageUpdate").length; i++) {
            if (halt = await this.events.get("messageUpdate")[i].handler(oldMsg, msg)) break;
          }
        }
        let parse = await this.parse(msg);
        if (parse && !halt) this.execute(parse.command, msg, parse.suffix);
      } catch(e) {
        this.errorHandler(e, msg);
      }
    });

    this.config.events.forEach(event => {
      Client.on(event, async (...args) => {
        try {
          if (this.events.has(event) && (this.events.get(event).length > 0)) {
            for (let i = 0; i < this.events.get(event).length; i++) {
              if (await this.events.get(event)[i].handler(...args)) break;
            }
          }
        } catch(e) {
          this.errorHandler(e);
        }
      });
    });

    Client.login(this.config.token).catch(reject);
  });
};

Handler.prototype.unload = function(file = null) {
  if (file) {
    file = path.resolve(file);
    try {
      // Clear Clockwork
      if (this.clockwork.has(file)) {
        clearInterval(this.clockwork.get(file));
        this.clockwork.delete(file);
      }

      // Clear Event Handlers
      this.events.forEach((handlers, event) => {
        this.events.set(event, handlers.filter(h => h.file != file));
      });

      // Unload
      let unloadData = null;
      if (this.unloadFn.has(file)) {
        unloadData = this.unloadFn.get(file)();
        this.unloadFn.delete(file);
      }

      // Clear Commands and Aliases
      this.commands = this.commands.filter(c => c.file != file);
      this.aliases = this.aliases.filter(c => c.file != file);

      // Clear cache and reload
      delete require.cache[require.resolve(file)];

      return unloadData;
    }
    catch(e) {
      this.errorHandler(e);
    }
  }

  return this;
};

/***********************
**  MODULE CONTAINER  **
***********************/

const Module = function() {
  this.commands = [];
  this.events = new Collection();
  this.clockwork = null;
  this.unload = null;
  this.config = {};

  return this;
};

Module.prototype.addCommand = function(info) {
  this.commands.push(new Command(info));
  return this;
};

Module.prototype.setClockwork = function(clockworkFunction) {
  this.clockwork = clockworkFunction;
  return this;
};

Module.prototype.addEvent = function(name, handler) {
  this.events.set(name, handler);
  return this;
};

Module.prototype.setUnload = function(unload) {
  this.unload = unload;
  return this;
};

Module.prototype.setInit = function(init) {
  this.init = init;
  return this;
};

/********************
**  COMMAND CLASS  **
********************/

const Command = function(info) {
  if (!info.name || !info.process) {
    throw("Commands must have the name and process properties.");
  }

  this.name = info.name;
  this.aliases = (info.aliases ? info.aliases : []);
  this.syntax = (info.syntax ? info.syntax : "");
  this.description = (info.description ? info.description : this.name + " " + this.syntax).trim();
  this.info = (info.info ? info.info : this.description);
  this.hidden = (info.hidden ? info.hidden : false);
  this.category = (info.category ? info.category : "General");
  this.permissions = (info.permissions ? info.permissions : () => true);
  this.process = info.process;

  this.file = null;

  return this;
};

Command.prototype.execute = function(msg, suffix) {
  if (this.permissions(msg)) this.process(msg, suffix);
};

/************************
**  SUPPORT FUNCTIONS  **
************************/

module.exports = {
  Module: Module,
  Handler: Handler
};
