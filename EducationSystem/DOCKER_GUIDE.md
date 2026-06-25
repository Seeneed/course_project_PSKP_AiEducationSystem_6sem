# Docker запуск (frontend + nginx HTTPS, backend, MSSQL)

## 1) Предварительно

- Установи Docker Desktop.
- Убедись, что свободны порты **`443` и `80`** (основной вариант: `https://localhost`), либо используй запасные **`8443` / `8080`**. Также нужны `5000` (backend), `14333` (MSSQL). На Windows порты 80/443 часто занимает **IIS** — тогда отключи сайт в IIS или пользуйся `8443`/`8080`.
- В корне проекта используется `docker-compose.yml`.

## 2) Переменные окружения

Compose использует пароль SQL Server из переменной `MSSQL_SA_PASSWORD`.

### PowerShell (текущая сессия):

```powershell
$env:MSSQL_SA_PASSWORD="YourStrong@Passw0rd"
```

> Используй сложный пароль (MSSQL требует policy).

`backend/.env` остается твоим основным файлом с API-ключом и JWT.  
В Docker для backend автоматически подставляется `DB_SERVER=mssql`.

## 3) Запуск

Из корня проекта:

```powershell
docker compose up --build
```

Что поднимется:

- `education-frontend-nginx` — SPA + Nginx reverse proxy + HTTPS
- `education-backend` — Node.js API
- `education-mssql` — Microsoft SQL Server
- `education-mssql-init` — одноразовая инициализация БД (скрипт таблиц)

## 4) Открытие в браузере

- **HTTPS (как у многих в Docker):** [https://localhost](https://localhost) — порт **443**
- **HTTP** → редирект на HTTPS: [http://localhost](http://localhost) — порт **80**
- Запасной вариант, если 80/443 заняты: [https://localhost:8443](https://localhost:8443) и [http://localhost:8080](http://localhost:8080)

### База и учётные записи в Docker

Контейнер MSSQL использует **отдельный** volume данных. После первого `docker compose up` таблицы создаются скриптом `db-init`, но **пользователей приложения там нет** — их нужно заново зарегистрировать через «Регистрация», затем первого администратора назначить вручную в БД или заранее предусмотреть сценарий курсового проекта. Старый логин/пароль с `npm run dev` к этой БД не относятся.

### HTTPS без предупреждения «Не защищено» (локально)

Публичные центры сертификации (в том числе Let's Encrypt) **не выдают** доверенные сертификаты именно на имя `localhost`. Для зелёного замка на своём ПК удобнее всего **mkcert**: он создаёт локальный корневой CA, который один раз добавляется в доверенные хранилища ОС/браузера.

1. Установи [mkcert](https://github.com/FiloSottile/mkcert) (Windows: например `choco install mkcert` или бинарник с релизов).
2. В PowerShell **от имени администратора** один раз: `mkcert -install`
3. В любой папке выполни: `mkcert localhost 127.0.0.1 ::1`  
   Появятся файлы вида `localhost+2.pem` и `localhost+2-key.pem` (имена могут чуть отличаться).
4. Скопируй их в каталог проекта `docker/nginx-certs` и **переименуй**:
   - сертификат → `custom.crt`
   - ключ → `custom.key`  
   (можно через проводник или `Copy-Item`.)
5. Перезапусти только фронт, чтобы Nginx подхватил файлы:

```powershell
docker compose up -d --build frontend
```

Пока в `docker/nginx-certs` нет пары `custom.crt` / `custom.key`, при первом старте контейнер сгенерирует **self-signed** `tls.crt` / `tls.key` — браузер покажет «Не защищено»; это нормально, пока не подключён mkcert.

**Почему у одногруппников «просто https://localhost» без красного:** чаще всего они либо уже поставили **mkcert** (`mkcert -install`) и положили сертификат в том же духе, либо один раз вручную добавили исключение в браузере. Публичный «белый» сертификат на чистый `localhost` выписать нельзя — для учебного стенда mkcert — стандартное решение.

Если после перехода на mkcert всё ещё ругается: удали в `docker/nginx-certs` старые `tls.crt` / `tls.key` (или всю папку кроме `custom.*`), перезапусти `frontend`.

Секретные файлы в `docker/nginx-certs` перечислены в `.gitignore` и в репозиторий не попадают.

## 5) Остановка

```powershell
docker compose stop
```

## 6) Полная остановка compose-стека

```powershell
docker compose down
```

Это не удаляет твои другие docker-проекты/контейнеры вне этого compose-стека.

## 7) Сброс базы (опционально)

Если нужен чистый старт БД:

```powershell
docker compose down -v
docker compose up --build
```

Флаг `-v` удалит volume только у этого стека (`mssql_data`).
