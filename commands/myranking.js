const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('quotes-myranking')
        .setDescription('Your personal ranking'),

    async execute(interaction, db) {
        const rows = db
            .prepare(
                `SELECT q.id, q.text, q.author, v.vote_value, (
                SELECT AVG(vv.vote_value)
                FROM votes vv
                WHERE vv.quote_id = q.id
                ) AS avg_score
            FROM quotes q
            JOIN votes v ON q.id = v.quote_id
            WHERE v.user_id = ?
            ORDER BY v.vote_value DESC
            LIMIT 5`
            )
            .all(interaction.user.id);

        if (!rows.length) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('Your Personal Ranking')
                        .setDescription("You haven't voted yet!")
                        .setColor('Red')
                ],
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('Your Personal Ranking')
            .setColor('#0099ff')
            .setFooter({ text: `Requested by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

        rows.forEach((r, i) => {
            let clipped = r.text.length > 350 ? r.text.slice(0, 347) + '...' : r.text;

            embed.addFields(
                { name: `${i + 1}. Quote by ${r.author}`, value: `“${clipped}”`, inline: true },
                { name: 'Your Vote', value: `${r.vote_value}`, inline: true },
                { name: 'Average', value: `${r.avg_score.toFixed(2)}`, inline: true }
            );
        });

        await interaction.reply({ embeds: [embed] });
    },
};
