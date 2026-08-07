import { api } from '../api';
import { showAlert } from '../telegram';
import AuctionForm from '../components/AuctionForm';

const EMPTY = {
  skinName: '',
  imageUrl: '',
  subcategoryId: '',
  rarity: 'MILSPEC',
  floatValue: '',
  wearCondition: 'FT',
  isStatTrak: false,
  paintSeed: '',
  steamAssetId: '',
  stickers: [],
  startPrice: '',
  durationMinutes: '60',
};

export default function NewAuctionPage() {
  async function handleCreate(payload) {
    try {
      await api.post('/admin/auctions', payload);
      showAlert('✅ Аукцион создан.');
      window.location.reload(); // eng oddiy yo'l bilan formani tozalash
    } catch (err) {
      showAlert(err.response?.data?.error || 'Произошла ошибка.');
    }
  }

  return <AuctionForm initial={EMPTY} submitLabel="Создать аукцион" onSubmit={handleCreate} />;
}
