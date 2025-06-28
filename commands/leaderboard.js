const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('quotes-leaderboard')
        .setDescription('See top quotes'),

    async execute(interaction, db) {
        const rows = db
            .prepare(
                `SELECT
                    q.id,
                    q.text,
                    q.author,
                    COALESCE(AVG(v.vote_value), 0) AS avg_score,
                    COUNT(v.id) AS votes
                FROM quotes q
                LEFT JOIN votes v ON q.id = v.quote_id
                GROUP BY q.id
                ORDER BY avg_score DESC, votes DESC
                LIMIT 5`
            )
            .all();

        if (!rows.length) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('Top Quotes Leaderboard')
                        .setDescription('There are no quotes yet!')
                        .setColor('Red')
                ],
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('Top Quotes Leaderboard')
            .setColor('#0099ff')
            .setFooter({ text: `Requested by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

        rows.forEach((r, i) => {
            // Limit to ~350 characters
            const clipped = r.text.length > 350 ? r.text.slice(0, 347) + '...' : r.text;

            embed.addFields(
                { name: `${i + 1}. Quote by ${r.author}`, value: `“${clipped}”`, inline: true },
                { name: 'Average', value: `${r.avg_score.toFixed(2)}`, inline: true },
                { name: 'Votes', value: `${r.votes}`, inline: true }
            );
        });

        await interaction.reply({ embeds: [embed] });
    },
};
