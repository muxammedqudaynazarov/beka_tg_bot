/**
 * Frontend har bir auksion sahifasini ochganda shu auksionning "xonasi"ga
 * qo'shiladi (join). Yangi taklif kelganda (auctionService orqali) yoki
 * auksion yopilganda faqat o'sha xonadagilarga xabar yuboriladi — bu barcha
 * ulangan foydalanuvchilarga hamma narsani broadcast qilishdan ancha samarali.
 */
function attachAuctionSocket(io) {
  io.on('connection', (socket) => {
    socket.on('auction:join', (auctionId) => {
      if (typeof auctionId === 'string') socket.join(`auction:${auctionId}`);
    });
    socket.on('auction:leave', (auctionId) => {
      if (typeof auctionId === 'string') socket.leave(`auction:${auctionId}`);
    });
  });
}

module.exports = { attachAuctionSocket };
