// File: index.js
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const { SlashCommandBuilder } = require("@discordjs/builders");
const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v10");
const dotenv = require("dotenv");
const moment = require("moment-timezone");
const axios = require("axios");

dotenv.config();

// Bot configuration
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Time zones to convert to
const TIME_ZONES = [
  { name: "PDT", zone: "America/Los_Angeles" },
  { name: "EDT", zone: "America/New_York" },
  { name: "BST", zone: "Europe/London" },
  { name: "CEST", zone: "Europe/Paris" },
  { name: "CST", zone: "Asia/Shanghai" },
  { name: "JST", zone: "Asia/Tokyo" },
  { name: "AEST", zone: "Australia/Sydney" },
];

// Languages to translate to
const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "zh", name: "Chinese" },
  { code: "hu", name: "Hungarian" },
  { code: "de", name: "German" },
  { code: "ja", name: "Japanese" },
];

// Translation function (using DeepL API)
async function translateText(text, targetLang, sourceLang = "fr") {
  try {
    // Try DeepL first
    const deeplResponse = await axios.post(
      "https://api-free.deepl.com/v2/translate",
      {
        text: [text],
        target_lang: targetLang,
        source_lang: sourceLang,
      },
      {
        headers: {
          Authorization: `DeepL-Auth-Key ${process.env.DEEPL_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    return deeplResponse.data.translations[0].text;
  } catch (error) {
    console.log("DeepL translation failed.");
    console.error(error.response.data);
  }
}

// Convert UTC time to different time zones
function convertTime(utcTime) {
  const utcMoment = moment.utc(utcTime);

  return TIME_ZONES.map((tz) => {
    const localTime = utcMoment.clone().tz(tz.zone);
    return {
      zone: tz.name,
      time: localTime.format("YYYY-MM-DD HH:mm"),
      day: localTime.format("dddd"),
    };
  });
}

// Register slash commands
const commands = [
  new SlashCommandBuilder()
    .setName("event")
    .setDescription("Create a new alliance event")
    .addStringOption((option) =>
      option.setName("name").setDescription("Event name").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("description")
        .setDescription("Event description")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("date")
        .setDescription("Event date (YYYY-MM-DD)")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("time")
        .setDescription("Event time in UTC (HH:MM)")
        .setRequired(true)
    )
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel to send the event notification to")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
];

// Deploy commands when the bot starts
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log("Registering slash commands...");

    await rest.put(Routes.applicationCommands(client.user.id), {
      body: commands,
    });

    console.log("Successfully registered slash commands");
  } catch (error) {
    console.error("Error registering slash commands:", error);
  }
});

// Handle slash commands
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;

  if (interaction.commandName === "event") {
    await interaction.deferReply();

    const eventName = interaction.options.getString("name");
    const eventDesc = interaction.options.getString("description");
    const eventDate = interaction.options.getString("date");
    const eventTime = interaction.options.getString("time");
    const channel =
      interaction.options.getChannel("channel") || interaction.channel;

    // Combine date and time for UTC
    const utcDateTime = `${eventDate} ${eventTime}`;

    try {
      // Generate time conversions
      const timeConversions = convertTime(utcDateTime);

      // Create translation results object
      const translations = {};

      // Translate event name and description to all languages
      for (const lang of LANGUAGES) {
        translations[lang.code] = {
          name: await translateText(eventName, lang.code),
          description: await translateText(eventDesc, lang.code),
        };
      }

      // Create a single embed with all translations
      const embed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle(`🌍 Alliance Event: ${eventName}`)
        .setDescription(`Original (French): ${eventDesc}`)
        .addFields(
          {
            name: "📅 Event Date & Time (UTC)",
            value: `${eventDate} ${eventTime}`,
            inline: false,
          },
          ...timeConversions.map((tc) => {
            return {
              name: tc.zone,
              value: `${tc.time} (${tc.day})`,
              inline: true,
            };
          })
        );

      // Add event names in all languages
      let namesField = "";
      let descriptionsField = "";

      for (const lang of LANGUAGES) {
        namesField += `**${lang.name}**: ${translations[lang.code].name}\n`;
        descriptionsField += `**${lang.name}**: ${
          translations[lang.code].description
        }\n\n`;
      }

      embed.addFields(
        {
          name: "🌐 Event Name Translations",
          value: namesField,
          inline: false,
        },
        {
          name: "📝 Event Description Translations",
          value: descriptionsField,
          inline: false,
        }
      );

      await channel.send({ embeds: [embed] });

      await interaction.editReply(
        "Event created and notification sent with all translations!"
      );
    } catch (error) {
      console.error("Error creating event:", error);
      await interaction.editReply(
        "Failed to create event. Please check your input and try again."
      );
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
