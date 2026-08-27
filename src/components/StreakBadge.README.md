# StreakBadge Component

## Описание
Компонент для отображения серии выполненных дней (streak) с визуальными эффектами и анимациями.

## Использование

```tsx
import { StreakBadge } from '../components/StreakBadge';

<StreakBadge 
  streak={activeUser.streak} 
  bonusPercent={Math.min(50, activeUser.streak * 5)} 
/>
```

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `streak` | `number` | ✅ | Количество дней подряд |
| `bonusPercent` | `number` | ✅ | Процент бонуса (например, 25 для +25%) |
| `onStreakUpdate` | `(streak: number, bonusPercent: number) => void` | ❌ | Callback при обновлении streak |

## Визуальные состояния

### Обычный streak (1-7 дней)
- Оранжево-красный градиент
- Иконка 🔥 с обычной пульсацией

### Высокий streak (8-10 дней)
- Золотистый градиент с свечением
- Иконка 🔥 с искрами (Sparkles)
- Shadow эффект

### Milestone (3, 7, 10 дней)
- Анимация pulse на badge
- Confetti при достижении
- Toast уведомление на 3 секунды
- Звуковой эффект

## Socket.IO Integration

Компонент автоматически реагирует на события:

```typescript
socket.on('streak_updated', (data) => {
  // data = { userId, current_streak, bonus_multiplier }
});
```

## Анимации

### CSS Transitions
- Плавная смена цветов при переходе 7→8 дней
- Анимация pulse на milestone
- Вращение искры (3s duration)

### Canvas Confetti
- Milestone confetti: 100 частиц, золотые цвета
- Обычное увеличение: 30 частиц

## Интеграция в сцены

### 1. FamilyHubScene
```tsx
// Правый верхний угол, рядом с кнопкой "Новое дело"
<StreakBadge 
  streak={activeUser.streak} 
  bonusPercent={Math.min(50, activeUser.streak * 5)} 
/>
```

### 2. BossRaidScene
```tsx
// Рядом с кнопкой "Мощный удар"
<StreakBadge 
  streak={activeUser.streak} 
  bonusPercent={Math.min(50, activeUser.streak * 5)} 
/>
```

### 3. WardrobeCustomizationScene
```tsx
// Рядом с балансом золота
<StreakBadge 
  streak={activeUser.streak} 
  bonusPercent={Math.min(50, activeUser.streak * 5)} 
/>
```

## Адаптивность

- Mobile (default): `w-4 h-4`, `text-sm`, `px-2.5 py-1.5`
- Desktop (sm:): `w-5 h-5`, `text-base`, `px-3 py-2`

## Haptic Feedback

- При увеличении streak: `triggerHaptic('notification', 'success')`
- Milestone: дополнительная вибрация через `sounds.playLevelUp()`

## Custom Hook

Для загрузки streak из API:

```tsx
import { useStreak } from '../hooks/useStreak';

const { streak, bonusPercent, isLoading } = useStreak(userId);

{!isLoading && (
  <StreakBadge streak={streak} bonusPercent={bonusPercent} />
)}
```

## Backend API Endpoint

```
GET /api/users/:userId/streak

Response:
{
  current_streak: number,
  bonus_multiplier: number,  // 1.25 для +25%
  last_completion_date: string | null
}
```

## Зависимости

- `canvas-confetti` - для confetti анимации
- `lucide-react` - иконки Flame, Sparkles
- `triggerHaptic()` - haptic feedback
- Socket.IO Client - real-time обновления
