# Family Life V3 — индекс Figma-экранов

## Новые рабочие сценарии — 11 сентября

[Общий вход в Figma](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=149%3A5247). Добавлены отдельные демонстрации с сохраняемым внутри маршрута состоянием:

| Страница | Результат | Открыть |
|---|---|---|
| 10 · Вход и семья | 20 экранов и оверлеев; создание, приглашения, профили устройства, PIN и восстановление | [Прототип](https://www.figma.com/proto/7D5G4cp3ui5cSlXqbwWIMv?node-id=131-938&starting-point-node-id=131%3A938) |
| 11 · Дела каждый день | 50 экранов; выполнение, проверка, возврат, история, совместные части и расписания | [Прототип](https://www.figma.com/proto/7D5G4cp3ui5cSlXqbwWIMv?node-id=136-3212&starting-point-node-id=136%3A3212) |
| 12 · Магазин и питомцы | 20 экранов; примерка, покупка, владение, резерв, питомец и бесплатный уголок | [Прототип](https://www.figma.com/proto/7D5G4cp3ui5cSlXqbwWIMv?node-id=136-5069&starting-point-node-id=136%3A5069) |
| 13 · Персонажи — пилот | Один ребёнок: общая база и отдельная туника; взрослый художественный кандидат | [Пилот](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=134%3A27) |

Это 90 новых сценарных фреймов, включая стартовые экраны и оверлеи. Художественные доски считаются отдельно. Числа 57 экранов и 86 переменных ниже относятся к предыдущему деревянному этапу, а не ко всему расширенному файлу.

Браузером проверены четыре основные ветки входа, основной и совместный цикл дел, покупки ребёнка и взрослого, недостаток доступных монет, применение/снятие одежды, питомец и сохранение/отмена уголка. Логическая симуляция и нативная геометрия проверены отдельно; подробности и ограничения — в `PROTOTYPE_AUTH_UX.md`, `PROTOTYPE_TASKS_UX.md`, `PROTOTYPE_SHOP_PETS_UX.md` и `CHARACTER_PILOT.md`.

Состояние живёт внутри отдельной Figma-демонстрации. Свободный ввод заменён заполненными примерами; реальных аккаунтов, покупок, сервера и общего состояния между тремя маршрутами здесь нет. Полный арт не завершён: взрослая база требует чистого прозрачного силуэта, часть товарных изображений — заглушки, темы уголка пока меняют подпись, а не иллюстрацию.

Дата: 2026-09-11. [Открыть файл](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=26%3A2).

**57 мобильных фреймов:** 43 исходных состояния V3, 4 загрузочных, 6 художественных вариантов, 1 анимационный эксперимент и 3 сравнительные копии. Роли и имена описывают демонстрационные сценарии; обычная навигация не должна менять роль игрока.

Выбранный деревянный стиль применён к существующим экранам и общей библиотеке. [Витрина деревянных компонентов на странице 09](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=82%3A824) показывает Nav, Header, кнопки, Tabs, Card, Metric, Wallet, Choice и Field; она не входит в число мобильных фреймов. Основной пример — [Герой](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=48%3A507). Две другие пробы материалов сохранены в архивном статусе.

Финальная сверка — **PASS**: 57 фреймов без ошибок геометрии, 82 действия с корректными адресатами (54 NAVIGATE, 28 BACK). Библиотека: 38 главных компонентов, 4 набора вариантов, 7 текстовых стилей и 86 переменных без `ALL_SCOPES`; из 30 переменных Navigation 20 принадлежат архивным пробам. Отчёт: `work/figma-v3/wooden-theme/qa.json`. Это проверка макета и структуры ссылок, не полной работы приложения.

На всех 57 экранах сохранены число текстовых слоёв, подписи и состояния навигации, геометрия прогресса. Сегодня на 375 px и переход Герой → Питомцы проверены в браузерном прототипе. Актуальное видео загрузки — `work/figma-v3/wooden-theme/loading-motion.mp4`; `motion-qa.json` подтверждает просмотр одного кадра на 0,8 секунды, без повторного полного аудита движения.

## 01 · Сегодня и Дела

| Ключ | Экран | Сценарий |
|---|---|---|
| P01 | [Сегодня · взрослая семья](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=16%3A4) | Взрослый |
| P02 | [Дела · мои](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=16%3A7) | Ребёнок |
| P03 | [Дела · проверка и расписания](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=16%3A10) | Взрослый |
| T01 | [Дело · отправить результат](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=17%3A103) | Ребёнок |
| T02 | [Дело · проверить результат](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=17%3A106) | Взрослый |
| T03 | [Новое дело · части и расписание](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=17%3A109) | Взрослый |

## 02 · Мир

| Ключ | Экран | Сценарий |
|---|---|---|
| P04 | [Мир · активное приключение](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=17%3A112) | Взрослый |
| P05 | [Мир · начало пути](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=17%3A115) | Взрослый |
| W01 | [Мир · новая семейная цель](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=17%3A118) | Взрослый |
| W02 | [Мир · начало приключения](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=17%3A121) | Взрослый |

## 03 · Герой и питомцы

| Ключ | Экран | Сценарий |
|---|---|---|
| P06 | [Герой · облик](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=17%3A124) | Ребёнок |
| P07 | [Герой · питомцы](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=17%3A127) | Ребёнок |
| P08 | [Герой · вещи](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=17%3A130) | Взрослый |
| P09 | [Герой · история](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=17%3A133) | Ребёнок |
| item-purchase | [Покупка предмета · условия получены · ребёнок Лиза](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=17%3A136) | Ребёнок |
| item-owned | [Полученный предмет · примерка · взрослый Олег](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=17%3A139) | Взрослый |
| starter-pet-choice | [Первый питомец · бесплатный выбор · ребёнок Миша](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=17%3A142) | Ребёнок |
| egg-ready | [Яйцо готово к вылуплению · ребёнок Миша](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=17%3A145) | Ребёнок |
| pet-corner | [Питомец и бесплатный уголок · ребёнок Лиза](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=17%3A148) | Ребёнок |

## 04 · Семья и обещания

| Ключ | Экран | Сценарий |
|---|---|---|
| P10 | [Семья · участники](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=17%3A151) | Взрослый |
| P11 | [Семья · обещания](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=17%3A154) | Ребёнок |
| P12 | [Семья · результаты](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=17%3A157) | Взрослый |
| family-add-child | [Новый участник — ребёнок](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=17%3A160) | Взрослый |
| family-add-adult | [Новый участник — взрослый](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=17%3A163) | Взрослый |
| family-member-child | [Профиль участника — ребёнок](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=17%3A166) | Взрослый |
| family-member-self-adult | [Профиль участника — свой взрослый](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=17%3A169) | Взрослый |
| family-member-other-adult | [Профиль участника — другой взрослый](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=17%3A172) | Взрослый |
| family-calendar | [Календарь семьи](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=17%3A175) | Взрослый |
| ledger-correction | [Расчёт исправления детского результата · взрослый Марина](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=17%3A178) | Взрослый |
| reward-quote | [Условия семейного обещания · ребёнок Лиза](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=17%3A181) | Ребёнок |
| reward-editor | [Редактирование семейного обещания · взрослый Марина](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=17%3A184) | Взрослый |
| request-pending-adult | [Заявка ждёт одобрения · взрослый Марина](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=17%3A187) | Взрослый |
| approved-child-request | [Одобренная заявка и просьба об отмене · ребёнок Лиза](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=17%3A190) | Ребёнок |
| fulfill-adult | [Фактическое выполнение семейной награды · взрослый Марина](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=17%3A193) | Взрослый |
| cancel-request-adult | [Согласование просьбы ребёнка об отмене · взрослый Марина](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=17%3A196) | Взрослый |
| request-pending-child | [Заявка ждёт одобрения · самостоятельная отмена · ребёнок Лиза](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=17%3A199) | Ребёнок |

## 05 · Вход и загрузка

| Ключ | Экран | Сценарий |
|---|---|---|
| auth-sign-in | [Вход в профиль](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=18%3A2) | Взрослый |
| auth-start | [Начать вместе](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=18%3A5) | Взрослый |
| auth-recover | [Восстановить доступ](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=18%3A8) | Взрослый |
| auth-recovery-code | [Код восстановления](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=18%3A11) | Взрослый |
| profiles-adult | [Профили на устройстве — взрослый](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=18%3A14) | Взрослый |
| profiles-managed-child | [Профили на устройстве — детский режим](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=18%3A17) | Ребёнок |
| profiles-personal-child | [Профили на устройстве — личный вход ребёнка](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=18%3A20) | Ребёнок |

## Дополнительные макеты

| Тип | Макет |
|---|---|
| Загрузка | [Открываем Family Life](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=21%3A1839) |
| Загрузка | [Подключаемся к дому](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=21%3A1840) |
| Загрузка | [Не удалось подключиться](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=21%3A1841) |
| Загрузка | [Подключаемся снова](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=21%3A1842) |
| Эксперимент | [Тёплый дом · 390 px](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=25%3A2) |
| Эксперимент | [Светлая V3 · 375 px](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=25%3A145) |

## 09 · Новые художественные эксперименты

| Тип | Макет |
|---|---|
| Художественный | [Сегодня](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=47%3A233) |
| Художественный | [Дела](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=47%3A338) |
| Художественный | [Мир](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=47%3A440) |
| Художественный | [Герой](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=48%3A507) |
| Художественный | [Питомцы](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=48%3A599) |
| Художественный | [Семья](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=48%3A671) |
| Анимация | [Загрузка · один проход 2 секунды](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=56%3A710) |
| Сравнительная копия | [Художественный вариант · 375 px](https://www.figma.com/design/7D5G4cp3ui5cSlXqbwWIMv?node-id=64%3A740) |

Иллюстрации вставлены через нативный SLOT `Artwork` компонента `Art`. Три концепта ImageGen и исходные референсы собраны на странице `08 · Референсы`. Четыре исходных загрузчика и их анимационная копия используют обрезанный первый референс. Новые PNG предназначены только для Figma; приложение их не загружает.

[Инструкция по редактированию](./FIGMA_HANDOFF.md).
