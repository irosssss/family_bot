# G03-F: командные переходы

Рабочая спецификация, 2026-09-07. Только target и синтетическая среда.

| Команда | Источник и подтверждение | Commit |
|---|---|---|
| Recovery request | Одноразовый verified launch; конкретная семья и active adult binding | Неизменные Account/identity/launch кандидата, revision защиты, короткий opaque request bearer |
| Recovery authorize | Текущий подтверждённый код либо другой adult с новым PIN | Основание привязано к request/revision/candidate; права ещё не выдаются |
| Recovery complete | Request bearer, два одинаковых PIN; живой candidate и основание | Новый binding того же parent profile; старые binding/managed descendants/защита/коды закрыты; pending protection и ограниченный setup |
| Invite issue | Adult с новым PIN, existing child profile либо adult join | Короткий случайный секрет; issuer binding/protection revisions |
| Invite claim | Секрет и одноразовый verified launch | Candidate фиксируется единожды; отдельный opaque candidate bearer |
| Invite approve | Любой действующий взрослый той же семьи с новым PIN, точная revision заявленного кандидата | Одобрение без семейных прав; issuer также остаётся действующим |
| Invite consume | Candidate bearer; issuer/candidate/profile/revisions живы | Один binding; для adult один новый parent profile, для child существующий Player сохраняется |
| Leave | Сам взрослый с новым PIN | Другой active взрослый с завершённой защитой обязателен; семейные credentials и незавершённые процессы закрываются |
| Exclusion request / consent | Инициатор с новым PIN; затем именно target с новым PIN подтверждает точный запрос | Тот же результат, что leave; одностороннего исключения нет |

Во всех командах: shared policy head → family lock → identity/account/binding → request.
KDF выполняется вне family lock с существующим ограничением двух работ; после KDF
повторно проверяются source и revisions. Долговременные привязки не переназначаются:
создаются новые, история старых Accounts и действий остаётся неизменной.

Recovery-код не расходуется при одном предъявлении: он остаётся основанием ровно до
атомарного завершения с новым PIN. Конкурентные запросы теряют силу после смены
protection/binding revision. Ошибки кода ограничиваются по candidate и target отдельно
от PIN-канала. Все сроки берутся из версии security policy (setupSeconds/freshSeconds,
sourceWindowSeconds/sourceAttemptMax), production-числа не утверждаются.

Потерянный ответ complete: заранее выданный request bearer становится bearer
ограниченного setup; getSetup позволяет продолжить, rotatePendingRecovery меняет
неподтверждённый новый код. Старый код и старые права не возвращаются.
Истечение setup требует нового доверенного восстановления; обычный beginSetup не
должен обходить чужой незавершённый recovery.

Выход отзывает managed bindings данного взрослого, но сохраняет child profiles,
Players и own_child bindings. Принятый преемник означает действующее участие с
активной защитой. Общий revokeBinding продолжает запрещать adult membership.
O01/O09 и production consent/retention остаются условиями будущего transport gate.

## Обязательные доказательства

| Граница | Проверки |
|---|---|
| Recovery | Тот же Account / новый Account; код / второй взрослый; чужая семья; без основания; revoked credential; pending protection; expiry; конкурентный completion |
| Потерянный ответ | Request bearer продолжает setup; ротация неподтверждённого кода; старый bearer/code не получает прежние права |
| Invitation | Два кандидата; повтор того же кандидата; точная revision approval; expired/revoked/issuer left; archived child; один profile/binding, прежний Player |
| Lifecycle | Self leave; consent только target; last adult; pending/disabled successor; два одновременных выхода; отзыв незавершённых процессов |
| Конкурентность | Два pool; новый service после рестарта; изменение policy/source/target во время KDF; family command до/после leave; rollback вставки/audit |
| Storage | Полные закрытые DTO; SQL NULL/foreign scope/uniqueness; generated DDL/catalog; rollback 0006 и неизменность 0001–0005 |

Это план проверок, не отметки PASS. Фактические результаты фиксируются отдельно
в отчёте G03-F после полного прогона.
