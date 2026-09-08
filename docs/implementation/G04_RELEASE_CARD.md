# G04-C — локальная публикация и атомарная активация

Версия 1.0, 2026-09-08. Продолжение W14 по разрешению пользователя «дедай».

Объём: собственная target PostgreSQL, immutable local storage, публикация целого
проверенного графа plain_text, отдельный snapshot/head CAS, история и повтор операций.
Синтетический оператор и review привязаны к exact compiler result; семейные полномочия
не принимаются. Fixture compatibility не становится production approval.

Файлы сначала сохраняются и перечитываются; publication-транзакция регистрирует
весь граф. Активация проверяет exact зависимости, схемы и файлы, затем меняет head,
snapshot и проекцию одним commit. Старые releases и файлы сохраняются.

Проверки: interrupted/corrupt storage, DB rollback, version/digest conflict,
operation replay, approval expiry/mismatch, closure/capabilities, конкурентный CAS,
head SHARE lock и неизменность истории. Production credentials/hosting, реальные
операторы, покупки, acquired refs, migration readiness и GC остаются будущими блоками.
