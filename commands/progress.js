const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

function makeProgressBar(value, max, size = 10) {
  const ratio = max === 0 ? 0 : value / max;
  const filled = Math.round(ratio * size);
  const empty = size - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('quotes-progress')
    .setDescription('See how many quotes have been voted on'),

  async execute(interaction, db) {
    const total = db
      .prepare('SELECT COUNT(*) AS total FROM quotes')
      .get().total;

    const voted = db
      .prepare('SELECT COUNT(DISTINCT quote_id) AS voted FROM votes')
      .get().voted;

    if (total === 0) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Quote Voting Progress')
            .setDescription('No quotes have been added yet!')
            .setColor('Red')
        ],
        ephemeral: true
      });
    }

    const percent = voted / total;
    const bar = makeProgressBar(voted, total, 12);
    const percentText = Math.round(percent * 100);

    const embed = new EmbedBuilder()
      .setTitle('Quote Voting Progress')
      .setColor('#00aa88')
      .setDescription(
        `${bar} **${percentText}%**\n\n` +
        `**${voted}** / **${total}** quotes have been voted on\n` +
        `2 daily quotes means probably done in ${voted/2} days`
      )
      .setFooter({
        text: `Requested by ${interaction.user.tag}`,
        iconURL: interaction.user.displayAvatarURL()
      });

    await interaction.reply({ embeds: [embed] });
  }
};
