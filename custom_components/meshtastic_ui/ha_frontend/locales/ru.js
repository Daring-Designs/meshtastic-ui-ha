/* Russian strings. Missing keys fall back to English. */
export default {
  common: {
    save: "Сохранить",
    cancel: "Отмена",
    close: "Закрыть",
    delete: "Удалить",
    confirm: "Подтвердить",
    loading: "Загрузка…",
    unknown: "Неизвестно",
    none: "Нет",
    yes: "Да",
    no: "Нет",
    enabled: "Включено",
    disabled: "Отключено",
    retry: "Повторить",
    search: "Поиск",
    refresh: "Обновить"
  },
  modules: {
    update_interval_secs: "Интервал обновления (сек)",
    options: {
      default: "По умолчанию",
      simple: "Простой",
      text_message: "Текстовое сообщение",
      up_down_select: "Вверх/Вниз/Выбор",
      rotary_encoder: "Роторный энкодер",
      bitrate_bps: "{rate} бит/с"
    },
    mqtt: {
      title: "Настройка MQTT",
      subtitle: "Настройка подключения к MQTT-брокеру, шифрования и отчётности на карте.",
      enabled: "MQTT включён",
      enabled_desc: "Включить MQTT-клиент на этом устройстве",
      broker: "Брокер",
      address: "Адрес",
      address_desc: "Имя хоста или IP MQTT-брокера",
      port: "Порт",
      username: "Имя пользователя",
      password: "Пароль",
      root_topic: "Корневой топик",
      root_topic_desc: "Корневой топик MQTT",
      options: "Параметры",
      encryption: "Шифрование включено",
      encryption_desc: "Шифровать MQTT-трафик",
      json: "JSON включён",
      json_desc: "Отправлять сообщения в формате JSON в MQTT",
      tls: "TLS включён",
      tls_desc: "Использовать TLS для подключения к брокеру",
      proxy_to_client: "Прокси к клиенту включён",
      proxy_to_client_desc: "Проксировать MQTT-трафик через подключённый клиент",
      map_reporting: "Отчётность на карте включена",
      map_reporting_desc: "Отправлять позицию на карту Meshtastic"
    },
    serial: {
      title: "Последовательный порт",
      subtitle: "Настройка модуля последовательного интерфейса для связи с внешними устройствами.",
      enabled_desc: "Включить последовательный модуль",
      baud_rate: "Скорость передачи",
      mode: "Режим",
      mode_desc: "Протокол последовательной связи",
      rx_gpio: "GPIO приёма",
      tx_gpio: "GPIO передачи",
      timeout: "Таймаут (мс)",
      timeout_desc: "Таймаут последовательного порта в миллисекундах",
      echo: "Эхо",
      echo_desc: "Отражать полученные данные обратно",
      override_console: "Переопределить консольный порт",
      override_console_desc: "Использовать основной последовательный порт для этого модуля"
    },
    ext_notification: {
      title: "Внешнее уведомление",
      subtitle: "Настройка уведомлений через зуммер, вибромотор и светодиод.",
      enabled_desc: "Включить модуль внешних уведомлений",
      output: "Выход",
      output_gpio: "GPIO выхода",
      output_gpio_desc: "Пин GPIO для сигнала уведомления",
      output_vibra: "GPIO вибро",
      output_vibra_desc: "GPIO для вибромотора",
      output_buzzer: "GPIO зуммера",
      output_buzzer_desc: "GPIO для пьезозуммера",
      nag_timeout: "Повтор уведомления (сек)",
      nag_timeout_desc: "Интервал повтора уведомления (0 = однократно)",
      output_ms: "Длительность сигнала (мс)",
      output_ms_desc: "Длительность импульса уведомления",
      triggers: "Триггеры",
      alert_message: "Сигнал при сообщении",
      alert_message_desc: "Уведомлять при входящих сообщениях",
      alert_message_buzzer: "Зуммер при сообщении",
      alert_message_buzzer_desc: "Использовать зуммер для уведомлений о сообщениях",
      alert_message_vibra: "Вибро при сообщении",
      alert_message_vibra_desc: "Использовать вибрацию для уведомлений о сообщениях",
      alert_bell: "Сигнал при звонке",
      alert_bell_desc: "Уведомлять при получении символа звонка",
      alert_bell_buzzer: "Зуммер при звонке",
      alert_bell_vibra: "Вибро при звонке",
      use_pwm: "PWM зуммер",
      use_pwm_desc: "Управлять зуммером через ШИМ для тонов",
      active_high: "Активный высокий уровень",
      active_high_desc: "Выход активен при высоком уровне (а не низком)"
    },
    store_forward: {
      title: "Сохранить и переслать",
      subtitle: "Сохранение сообщений и пересылка их узлам, которые появятся в сети позже.",
      enabled_desc: "Включить модуль Сохранить и переслать",
      records: "Записей",
      records_desc: "Количество сохраняемых сообщений (0 = авто)",
      history_return_max: "Макс. возврат истории",
      history_return_max_desc: "Максимум сообщений для возврата по запросу",
      history_return_window: "Окно истории (сек)",
      history_return_window_desc: "Временное окно для запросов истории",
      heartbeat: "Пульс",
      heartbeat_desc: "Отправлять периодический пульс клиентам",
      is_server: "Сервер S&F",
      is_server_desc: "Выступать сервером S&F для сети"
    },
    range_test: {
      title: "Тест дальности",
      subtitle: "Отправка периодических тестовых сообщений для измерения дальности и качества связи.",
      enabled_desc: "Включить модуль тестирования дальности",
      sender_interval: "Интервал отправки (сек)",
      sender_interval_desc: "Секунд между тестовыми сообщениями (0 = только приём)",
      save_to_file: "Сохранить в файл",
      save_to_file_desc: "Сохранять полученные тестовые данные в файл"
    },
    telemetry: {
      title: "Телеметрия",
      subtitle: "Настройка интервалов телеметрии устройства, окружающей среды, качества воздуха и электропитания.",
      device_metrics: "Метрики устройства",
      banner_title: "Графики не обновляются?",
      banner_default: "Прошивка 2.7.x по умолчанию устанавливает это значение в {default} (1 час), поэтому графики батареи / использования канала / эфира могут выглядеть замороженными.",
      banner_advice: "Для оперативного дашборда установите {five} (5 мин) или {ten} (10 мин).",
      preset_minutes: "{minutes} мин",
      device_update_interval_desc: "Как часто радио рассылает метрики устройства. 0 использует значение прошивки по умолчанию (3600 с в fw 2.7.x).",
      environment: "Окружающая среда",
      environment_enabled: "Измерение среды включено",
      environment_enabled_desc: "Включить считывание датчиков окружающей среды",
      environment_interval: "Интервал обновления среды (сек)",
      environment_screen: "Среда на экране",
      show_on_screen_desc: "Показывать на экране (1 = да)",
      air_quality: "Качество воздуха",
      air_quality_enabled: "Качество воздуха включено",
      air_quality_enabled_desc: "Включить считывание датчиков качества воздуха",
      air_quality_interval: "Интервал качества воздуха (сек)",
      power_metrics: "Метрики питания",
      power_enabled: "Измерение питания включено",
      power_enabled_desc: "Включить считывание датчиков питания (INA-датчики)",
      power_interval: "Интервал обновления питания (сек)",
      power_screen: "Питание на экране"
    },
    canned_message: {
      title: "Готовые сообщения",
      subtitle: "Предустановленные сообщения, которые можно быстро отправить с помощью аппаратного ввода.",
      enabled_desc: "Включить модуль готовых сообщений",
      messages: "Сообщения",
      messages_help: "По одному сообщению на строку. Используйте | для разделения. Доступно с аппаратного ввода устройства.",
      messages_placeholder: "Привет|Уже иду|Скоро буду",
      input_source: "Источник ввода",
      input_event_source: "Источник событий ввода",
      pin_a: "Пин A",
      pin_a_desc: "GPIO для роторного энкодера / кнопки A",
      pin_b: "Пин B",
      pin_b_desc: "GPIO для роторного энкодера B",
      pin_press: "Пин нажатия",
      pin_press_desc: "GPIO для нажатия/выбора",
      rotary_enabled: "Роторный энкодер включён",
      updown_enabled: "Вверх/Вниз включено",
      send_bell: "Отправлять звонок",
      send_bell_desc: "Добавлять символ звонка, чтобы устройство получателя подало сигнал",
      allow_input_source: "Разрешить ввод",
      allow_input_source_desc: "Разрешить ввод сообщений с аппаратного устройства"
    },
    audio: {
      title: "Аудио / Codec2",
      subtitle: "Настройка аудиокодека для голосовой связи через сеть.",
      codec2_enabled: "Codec2 включён",
      codec2_enabled_desc: "Включить аудиомодуль Codec2",
      bitrate: "Битрейт",
      bitrate_desc: "Настройка битрейта Codec2",
      ptt_gpio: "GPIO PTT",
      ptt_gpio_desc: "GPIO для кнопки нажми-и-говори"
    },
    neighbor_info: {
      title: "Информация о соседях",
      subtitle: "Рассылка информации о прямых соседях для отображения топологии сети.",
      enabled_desc: "Включить модуль информации о соседях",
      update_interval_desc: "Как часто рассылать информацию о соседях (0 = по умолчанию)"
    },
    ambient_lighting: {
      title: "Окружающее освещение",
      subtitle: "Настройка цвета и яркости встроенного светодиода.",
      led_state: "Состояние LED",
      led_state_desc: "Включить или выключить светодиод",
      red: "Красный",
      red_desc: "Красный канал (0-255)",
      green: "Зелёный",
      green_desc: "Зелёный канал (0-255)",
      blue: "Синий",
      blue_desc: "Синий канал (0-255)",
      current: "Ток",
      current_desc: "Яркость / ограничение тока LED (0-31)"
    },
    detection_sensor: {
      title: "Датчик обнаружения",
      subtitle: "Настройка датчика обнаружения на основе GPIO, отправляющего оповещения в сеть.",
      enabled_desc: "Включить модуль датчика обнаружения",
      monitor_pin: "Пин мониторинга",
      monitor_pin_desc: "Пин GPIO для отслеживания сигнала",
      min_broadcast_secs: "Мин. интервал рассылки (сек)",
      min_broadcast_secs_desc: "Минимальный интервал между рассылками оповещений",
      state_broadcast_secs: "Интервал рассылки состояния (сек)",
      state_broadcast_secs_desc: "Периодический интервал рассылки состояния",
      triggered_high: "Сообщение HIGH",
      triggered_high_desc: "Сообщение при переходе пина в HIGH",
      triggered_low: "Сообщение LOW",
      triggered_low_desc: "Сообщение при переходе пина в LOW",
      send_bell: "Отправить звонок",
      send_bell_desc: "Отправлять звонок-уведомление вместе с оповещением",
      use_pullup: "Подтягивающий резистор",
      use_pullup_desc: "Включить внутренний подтягивающий резистор"
    },
    paxcounter: {
      title: "Счётчик Pax",
      subtitle: "Подсчёт ближайших устройств Wi-Fi и BLE с рассылкой результатов в сеть.",
      enabled_desc: "Включить модуль Paxcounter",
      update_interval_desc: "Как часто рассылать счётчик Pax (0 = по умолчанию)",
      wifi_threshold: "Порог Wi-Fi",
      wifi_threshold_desc: "Включить подсчёт устройств Wi-Fi",
      ble_threshold: "Порог BLE",
      ble_threshold_desc: "Включить подсчёт устройств BLE"
    }
  },
  panel: {
    tabs: {
      radio: "Радио",
      messages: "Сообщения",
      nodes: "Узлы",
      map: "Карта",
      settings: "Настройки"
    },
    header: {
      sidebar_toggle: "Переключить боковую панель"
    },
    reconnect: {
      reconnecting: "Переподключение…",
      connection_lost: "Соединение потеряно — нажмите, чтобы переподключиться"
    },
    feedback: {
      trace_route_unavailable: "Трассировка маршрута недоступна",
      position_request_sent: "Запрос позиции отправлен",
      position_request_unavailable: "Запрос позиции недоступен",
      nodeinfo_request_sent: "Запрос информации об узле отправлен",
      nodeinfo_request_unavailable: "Запрос информации об узле недоступен",
      added_to_favorites: "Добавлено в избранное",
      removed_from_favorites: "Удалено из избранного",
      node_ignored: "Узел игнорируется",
      node_unignored: "Узел восстановлен",
      action_failed: "Действие не выполнено",
      node_removed: "Узел удалён",
      remove_failed: "Удаление не выполнено"
    },
    time: {
      just_now: "Только что",
      minutes_ago: "{count} мин назад",
      hours_ago: "{count} ч назад",
      days_ago: "{count} д назад",
      uptime_seconds: "{seconds} с",
      uptime_minutes: "{minutes} мин",
      uptime_hours: "{hours} ч {minutes} мин",
      uptime_days: "{days} д {hours} ч"
    },
    node_dialog: {
      confirm_remove: "Удалить узел {name}?",
      add_to_favorites: "Добавить в избранное",
      remove_from_favorites: "Убрать из избранного",
      ignored_badge: "ИГНОРИРУЕТСЯ",
      sections: {
        identity: "Идентификация",
        radio: "Радио",
        power: "Питание",
        environment: "Окружающая среда",
        position: "Позиция"
      },
      metrics: {
        node_id: "ID узла",
        short_name: "Краткое имя",
        long_name: "Полное имя",
        hardware: "Оборудование",
        last_seen: "Последний раз в сети",
        hops: "Прыжки",
        air_util_tx: "Исп. эфира TX",
        channel_util: "Исп. кан.",
        battery: "Батарея",
        voltage: "Напряжение",
        uptime: "Время работы",
        temperature: "Температура",
        humidity: "Влажность",
        pressure: "Давление",
        latitude: "Широта",
        longitude: "Долгота",
        altitude: "Высота"
      },
      actions: {
        message: "Написать",
        tracing: "Трассировка...",
        trace_route: "Трассировка маршрута",
        requesting: "Запрос...",
        request_position: "Запросить позицию",
        view_on_map: "Показать на карте",
        request_info: "Запросить информацию",
        ignore: "Игнорировать",
        unignore: "Восстановить",
        remove: "Удалить"
      }
    },
    traceroute: {
      timed_out_title: "Трассировка маршрута истекла",
      no_response: "Нет ответа от {name} в течение 30 секунд.",
      out_of_range_hint: "Узел может быть вне зоны досягаемости или выключен.",
      title: "Трассировка: {source} → {destination}",
      direct_connection: "Прямое подключение",
      intermediate_hops: {
        one: "{count} промежуточный прыжок",
        few: "{count} промежуточных прыжка",
        many: "{count} промежуточных прыжков",
        other: "{count} промежуточного прыжка"
      },
      source: "Источник",
      destination: "Назначение",
      hop: "Прыжок {number}",
      return_route: "Обратный маршрут (другой путь)"
    },
    notifications: {
      title: "Настройки уведомлений",
      enable: "Включить уведомления",
      service: "Сервис уведомлений",
      filter: "Фильтр сообщений",
      filter_all: "Все сообщения",
      filter_channel: "Только каналы",
      filter_dm: "Только личные сообщения"
    }
  },
  components: {
    password: {
      show: "Показать",
      hide: "Скрыть"
    },
    save_bar: {
      unsaved_changes: "Есть несохранённые изменения",
      discard: "Отменить изменения",
      saving: "Сохранение..."
    }
  },
  settings: {
    lora: {
      region: "Регион",
      modem_preset: "Пресет модема",
      hop_limit: "Лимит прыжков",
      hop_limit_desc: "Максимальное число прыжков (1-7)",
      tx_power: "Мощность TX (дБм)",
      tx_power_desc: "Мощность передачи в дБм (0 = максимум для региона)",
      frequency_offset: "Смещение частоты (Гц)",
      frequency_offset_desc: "Точная настройка смещения частоты",
      bandwidth: "Полоса пропускания (кГц)",
      bandwidth_desc: "Переопределить полосу пропускания (0 = использовать пресет)",
      spread_factor: "Коэффициент расширения",
      spread_factor_desc: "Переопределить коэффициент расширения (0 = использовать пресет)",
      coding_rate: "Скорость кодирования",
      coding_rate_desc: "Переопределить скорость кодирования (0 = использовать пресет)",
      tx_enabled: "TX включён",
      tx_enabled_desc: "Разрешить передачу",
      use_preset: "Использовать пресет",
      use_preset_desc: "Использовать пресет модема или пользовательские значения",
      override_duty_cycle: "Переопределить рабочий цикл",
      override_duty_cycle_desc: "Переопределить региональные ограничения рабочего цикла (использовать осторожно)",
      boosted_rx_gain: "Усиленный приём RX",
      boosted_rx_gain_desc: "Включить усиленный приём RX на SX1262",
      title: "Настройка LoRa",
      subtitle: "Настройка радиочастоты, пресета модема и параметров передачи.",
      presets: {
        long_fast: "Дальний диапазон / Быстро",
        long_slow: "Дальний диапазон / Медленно",
        long_moderate: "Дальний диапазон / Умеренно",
        short_fast: "Короткий диапазон / Быстро",
        short_slow: "Короткий диапазон / Медленно",
        medium_fast: "Средний диапазон / Быстро",
        medium_slow: "Средний диапазон / Медленно"
      },
      regions: {
        unset: "Не задан",
        lora_24: "2,4 ГГц"
      }
    },
    channels: {
      role: "Роль",
      name: "Имя",
      name_placeholder: "Название канала",
      psk_placeholder: "Ключ в Base64",
      uplink_enabled: "Восходящий канал включён",
      uplink_enabled_desc: "Пересылать пакеты из этого канала в MQTT",
      downlink_enabled: "Нисходящий канал включён",
      downlink_enabled_desc: "Пересылать пакеты из MQTT в этот канал",
      title: "Каналы",
      subtitle: "Настройте до 8 каналов. У каждого канала может быть своё имя и ключ шифрования.",
      psk_heading: "Ключ шифрования (PSK)",
      roles: {
        disabled: "Отключено",
        primary: "Основной",
        secondary: "Дополнительный"
      },
      channel_title: "Канал {index}",
      channel_title_named: "Канал {index} — {name}",
      generate_psk: "Создать",
      discard: "Отменить",
      saving: "Сохранение...",
      save_channel: "Сохранить канал"
    },
    user: {
      long_name: "Полное имя",
      long_name_desc: "Отображаемое имя вашего радио в сети (макс. 39 символов)",
      long_name_placeholder: "Моё радио Meshtastic",
      short_name: "Краткое имя",
      short_name_desc: "4-символьное сокращение для компактных дисплеев",
      licensed_operator: "Лицензированный оператор",
      licensed_operator_desc: "Если включено, узел будет использовать режим HAM с длинными именами и без шифрования",
      title: "Конфигурация пользователя",
      subtitle: "Задайте имя и идентификацию вашего радиоузла в сети."
    },
    device: {
      device_role: "Роль устройства",
      device_role_desc: "Определяет поведение устройства в сети",
      rebroadcast_mode: "Режим ретрансляции",
      rebroadcast_mode_desc: "Определяет, какие сообщения ретранслирует этот узел",
      node_info_broadcast_secs: "Интервал рассылки информации об узле (сек)",
      node_info_broadcast_secs_desc: "Как часто рассылать информацию об узле (секунд, 0 = по умолчанию)",
      button_gpio: "GPIO кнопки",
      button_gpio_desc: "Пин GPIO для кнопки пользователя (0 = по умолчанию)",
      buzzer_gpio: "GPIO зуммера",
      buzzer_gpio_desc: "Пин GPIO для зуммера (0 = по умолчанию)",
      double_tap_as_button_press: "Двойной стук как нажатие кнопки",
      double_tap_as_button_press_desc: "Использовать двойной стук на устройстве как нажатие кнопки",
      led_heartbeat_disabled: "Мигание LED отключено",
      led_heartbeat_disabled_desc: "Отключить мигание индикаторного светодиода",
      title: "Конфигурация устройства",
      subtitle: "Настройка роли устройства, режима ретрансляции и параметров оборудования.",
      roles: {
        client: "Клиент",
        client_mute: "Клиент (без ретрансляции)",
        client_hidden: "Клиент (скрытый)",
        client_base: "Клиент (базовая станция)",
        router: "Маршрутизатор",
        router_late: "Маршрутизатор (поздний)",
        router_client: "Маршрутизатор-клиент",
        repeater: "Ретранслятор",
        tracker: "Трекер",
        sensor: "Датчик",
        tak: "TAK",
        tak_tracker: "TAK-трекер",
        lost_and_found: "Поиск потерянного"
      },
      rebroadcast_modes: {
        all: "Все",
        all_skip_decoding: "Все (без декодирования)",
        local_only: "Только локально",
        known_only: "Только известным",
        none: "Нет"
      }
    },
    position: {
      gps_mode: "Режим GPS",
      gps_mode_desc: "Способ получения позиции устройством",
      position_broadcast_secs: "Интервал рассылки позиции (сек)",
      position_broadcast_secs_desc: "Как часто рассылать позицию (секунд, 0 = по умолчанию)",
      broadcast_smart_min_distance: "Мин. расстояние для умной рассылки (м)",
      broadcast_smart_min_distance_desc: "Минимальное расстояние для рассылки позиции (0 = отключено)",
      broadcast_smart_min_interval: "Мин. интервал для умной рассылки (сек)",
      broadcast_smart_min_interval_desc: "Минимальный интервал между умными рассылками",
      gps_update_interval: "Интервал обновления GPS (сек)",
      gps_update_interval_desc: "Как часто модуль GPS проверяет позицию",
      rx_gpio: "GPIO приёма",
      rx_gpio_desc: "Пин GPIO для GPS RX (0 = по умолчанию)",
      tx_gpio: "GPIO передачи",
      tx_gpio_desc: "Пин GPIO для GPS TX (0 = по умолчанию)",
      fixed_position: "Фиксированная позиция",
      fixed_position_desc: "Использовать фиксированную позицию вместо GPS",
      latitude: "Широта",
      longitude: "Долгота",
      altitude: "Высота (м)",
      smart_position_broadcast: "Умная рассылка позиции",
      smart_position_broadcast_desc: "Рассылать позицию только при обнаружении движения",
      gps_enabled: "GPS включён",
      gps_enabled_desc: "Включить встроенный модуль GPS",
      title: "Конфигурация позиции",
      subtitle: "Настройка GPS, фиксированной позиции и рассылки координат.",
      fixed_position_heading: "Фиксированная позиция",
      gps_modes: {
        disabled: "Отключено",
        enabled: "Включено",
        not_present: "Отсутствует"
      }
    },
    power: {
      on_battery_shutdown_after: "Выключение от батареи через (сек)",
      on_battery_shutdown_after_desc: "Автовыключение через столько секунд от батареи (0 = отключено)",
      min_wake_secs: "Минимальное время бодрствования (сек)",
      min_wake_secs_desc: "Минимальное время работы без сна (секунд)",
      light_sleep_interval: "Интервал лёгкого сна (сек)",
      light_sleep_interval_desc: "Интервал лёгкого сна для экономии энергии",
      wait_bluetooth_secs: "Ожидание Bluetooth (сек)",
      wait_bluetooth_secs_desc: "Секунд ожидания Bluetooth перед переходом в сон",
      adc_multiplier_override: "Переопределение множителя АЦП",
      adc_multiplier_override_desc: "Переопределить коэффициент делителя напряжения для считывания батареи (0 = авто)",
      power_saving: "Экономия энергии",
      power_saving_desc: "Включить режим экономии энергии (лёгкий сон между операциями)",
      title: "Конфигурация питания",
      subtitle: "Настройка экономии энергии, режима сна и управления батареей."
    },
    network: {
      wifi_enabled: "Wi-Fi включён",
      wifi_enabled_desc: "Включить подключение по Wi-Fi",
      wifi_ssid: "SSID Wi-Fi",
      wifi_ssid_placeholder: "Имя сети",
      wifi_password: "Пароль Wi-Fi",
      wifi_password_placeholder: "Пароль",
      ethernet_enabled: "Ethernet включён",
      ethernet_enabled_desc: "Включить подключение по Ethernet",
      ipv4_address: "IPv4-адрес",
      ipv4_address_desc: "Статический IPv4-адрес (оставьте пустым для DHCP)",
      gateway: "Шлюз",
      subnet_mask: "Маска подсети",
      dns_server: "DNS-сервер",
      ntp_server: "NTP-сервер",
      ntp_server_desc: "Адрес пользовательского NTP-сервера",
      syslog_server: "Syslog-сервер",
      syslog_server_desc: "Удалённый syslog-сервер (хост:порт)",
      title: "Конфигурация сети",
      subtitle: "Настройка Wi-Fi, Ethernet, NTP-сервера и syslog.",
      ip_heading: "Конфигурация IP",
      services_heading: "Сервисы"
    },
    display: {
      screen_on_secs: "Время работы экрана (сек)",
      screen_on_secs_desc: "Как долго остаётся включённым экран (0 = всегда)",
      auto_carousel_secs: "Интервал автокарусели (сек)",
      auto_carousel_secs_desc: "Секунд между автоматической сменой страниц (0 = отключено)",
      display_units: "Единицы измерения",
      display_mode: "Режим отображения",
      display_mode_desc: "Цветовой режим дисплея",
      oled_type: "Тип OLED",
      oled_type_desc: "Тип оборудования OLED-дисплея",
      heading_bold: "Жирный заголовок",
      heading_bold_desc: "Использовать жирный шрифт для заголовков (0 = нет, 1 = да)",
      flip_screen: "Перевернуть экран",
      flip_screen_desc: "Повернуть дисплей на 180 градусов",
      wake_on_tap_or_motion: "Пробуждение по касанию или движению",
      wake_on_tap_or_motion_desc: "Включать экран при обнаружении движения",
      compass_north_top: "Север сверху на компасе",
      compass_north_top_desc: "Всегда ориентировать компас севером вверх",
      title: "Конфигурация экрана",
      subtitle: "Настройка таймаута экрана, единиц измерения, типа OLED и параметров дисплея.",
      modes: {
        default: "По умолчанию",
        twocolor: "Двухцветный",
        inverted: "Инвертированный",
        color: "Цветной"
      },
      units: {
        metric: "Метрическая",
        imperial: "Имперская"
      },
      oled_types: {
        auto: "Автоопределение"
      }
    },
    bluetooth: {
      bluetooth_enabled: "Bluetooth включён",
      bluetooth_enabled_desc: "Включить Bluetooth",
      pairing_mode: "Режим сопряжения",
      pairing_mode_desc: "Как устройство выполняет сопряжение с Bluetooth-клиентами",
      fixed_pin: "Фиксированный PIN",
      fixed_pin_desc: "6-значный PIN для сопряжения",
      title: "Настройка Bluetooth",
      subtitle: "Настройка подключения Bluetooth, режима сопряжения и PIN.",
      pairing_modes: {
        random_pin: "Случайный PIN",
        fixed_pin: "Фиксированный PIN",
        no_pin: "Без PIN"
      }
    },
    security: {
      admin_channel_index: "Индекс канала администратора",
      admin_channel_index_desc: "Индекс канала для административных сообщений (0 = основной)",
      debug_log_enabled: "Журнал отладки включён",
      debug_log_enabled_desc: "Включить подробный журнал отладки на устройстве",
      admin_key_required: "Требуется ключ администратора",
      admin_key_required_desc: "Требовать ключ администратора для удалённого управления",
      serial_console_disabled: "Последовательная консоль отключена",
      serial_console_disabled_desc: "Отключить доступ через последовательную консоль в целях безопасности",
      title: "Конфигурация безопасности",
      subtitle: "Просмотр ключей PKI, настройка канала администратора и журнала отладки.",
      pki_heading: "PKI-ключи (только чтение)",
      key_set: "(задан)",
      key_not_set: "(не задан)",
      key_unavailable: "Недоступно",
      public_key: "Открытый ключ",
      private_key: "Закрытый ключ"
    },
    options_heading: "Параметры",
    actions: {
      title: "Действия с устройством",
      subtitle: "Управление радиоустройством Meshtastic. Деструктивные действия требуют подтверждения.",
      reboot: {
        name: "Перезагрузка",
        desc: "Перезапустить радиоустройство"
      },
      shutdown: {
        name: "Выключение",
        desc: "Выключить радиоустройство"
      },
      reset_nodedb: {
        name: "Сбросить базу узлов",
        desc: "Очистить базу данных узлов сети"
      },
      factory_reset_config: {
        name: "Сброс конфигурации",
        desc: "Сбросить всю конфигурацию до заводских настроек"
      },
      factory_reset_device: {
        name: "Полный сброс",
        desc: "Сбросить конфигурацию и очистить все данные"
      },
      reboot_ota: {
        name: "Перезагрузка в режим OTA",
        desc: "Перезагрузить в режим обновления OTA"
      },
      confirm_message: "Вы уверены, что хотите выполнить действие «{action}»?",
      confirm_message_danger: "Вы уверены, что хотите выполнить действие «{action}»? Это действие нельзя отменить.",
      command_sent: "Команда «{action}» успешно отправлена",
      command_failed: "Ошибка: команда «{action}» не выполнена"
    },
    storage: {
      title: "Хранилище",
      subtitle: "Управление данными, сохранёнными интеграцией в Home Assistant. Полезно при смене радио или сбросе до исходного состояния.",
      stats: {
        messages: "Сообщения",
        conversations: "Переписки",
        nodes: "Узлы",
        traceroutes: "Трассировки",
        waypoints: "Точки маршрута"
      },
      clear_messages: {
        name: "Очистить историю сообщений",
        desc: "Удалить всю сохранённую историю чатов (каналы и личные сообщения)"
      },
      clear_nodes: {
        name: "Очистить историю узлов",
        desc: "Удалить все отслеживаемые узлы и результаты трассировки"
      },
      clear_all: {
        name: "Очистить все сохранённые данные",
        desc: "Удалить сообщения, узлы, трассировки, точки маршрута, избранное и игнорируемые"
      },
      confirm_message: "Вы уверены, что хотите выполнить действие «{action}»? Это действие нельзя отменить.",
      done: "«{action}»: выполнено",
      failed: "Ошибка: действие «{action}» не выполнено"
    },
    load_error: "Не удалось загрузить конфигурацию с радио. Радио подключено?",
    loading_config: "Загрузка конфигурации радио...",
    select_panel: "Выберите раздел настроек",
    nav: {
      groups: {
        radio_config: "Конфигурация радио",
        device_config: "Конфигурация устройства",
        module_config: "Конфигурация модулей",
        device: "Устройство",
        local_data: "Локальные данные"
      },
      lora: "LoRa",
      channels: "Каналы",
      user: "Пользователь",
      device: "Устройство",
      position: "Позиция",
      power: "Питание",
      network: "Сеть",
      display: "Экран",
      bluetooth: "Bluetooth",
      security: "Безопасность",
      mqtt: "MQTT",
      serial: "Последовательный порт",
      ext_notification: "Внешние уведомления",
      store_forward: "Сохранить и переслать",
      range_test: "Тест дальности",
      telemetry: "Телеметрия",
      canned_message: "Готовые сообщения",
      audio: "Аудио",
      neighbor_info: "Информация о соседях",
      ambient_lighting: "Окружающее освещение",
      detection_sensor: "Датчик обнаружения",
      paxcounter: "Счётчик Pax",
      actions: "Действия с устройством",
      storage: "Хранилище"
    }
  },
  views: {
    date: {
      today: "Сегодня",
      yesterday: "Вчера"
    },
    time: {
      just_now: "Только что",
      minutes_ago: "{minutes} мин назад",
      hours_ago: "{hours} ч назад",
      days_ago: "{days} д назад"
    },
    duration: {
      seconds: "{seconds} с",
      minutes: "{minutes} мин",
      hours_minutes: "{hours} ч {minutes} мин",
      days_hours: "{days} д {hours} ч"
    },
    window: {
      "1h": "Последний час",
      "6h": "Последние 6 часов",
      "24h": "Последние 24 часа",
      "7d": "Последние 7 дней",
      all_time: "Всё время",
      custom: "Пользовательский"
    },
    chart: {
      now: "сейчас",
      seconds_ago: "-{seconds} с назад",
      minutes_ago: "-{minutes} мин назад",
      hours_ago: "-{hours} ч назад",
      days_ago: "-{days} д назад",
      axis_minutes: "-{minutes} мин",
      axis_hours: "-{hours} ч",
      axis_days: "-{days} д",
      loading: "Загрузка D3...",
      no_packets: "Пакеты ещё не получены"
    },
    packet_types: {
      text: "Текст",
      position: "Позиция",
      telemetry: "Телеметрия",
      nodeinfo: "Информация об узле",
      routing: "Маршрутизация",
      other_type: "Другое"
    }
  },
  radio: {
    empty: {
      title: "Радио Meshtastic не подключено",
      hint: "Проверьте подключение радио в настройках интеграции."
    },
    charts: {
      activity_heading: "Активность: {window}",
      telemetry_interval_hint: "Радио передаёт метрики устройства с этим интервалом. Изменить в Настройки → Телеметрия.",
      packets_per_minutes: "пак./{minutes} мин",
      packets_per_seconds: "пак./{seconds} с",
      channel_utilization: "Использование канала",
      airtime_tx: "Время в эфире TX",
      battery: "Батарея",
      packets_tx: "Отправлено пакетов",
      packets_rx: "Принято пакетов",
      packets_by_type: "Пакеты по типам"
    },
    interval: {
      firmware_default: "каждый час (по умолчанию)",
      seconds: "раз в {seconds} с",
      minutes: "раз в {minutes} мин",
      hours: "раз в {hours} ч"
    },
    switch_radio: "Переключить активное радио",
    default_name: "Радио Meshtastic",
    other_radio_unread: "На другом радио есть новые сообщения",
    uptime: "Работает {uptime}",
    reconnect: {
      title: "Принудительно переподключиться к радио",
      in_progress: "Переподключение…",
      button: "Переподключить"
    },
    metrics: {
      title: "Метрики",
      battery: "Батарея",
      voltage: "Напряжение",
      channel_utilization: "Использование канала",
      airtime: "Время в эфире",
      packets_tx: "Отправлено пакетов",
      packets_rx: "Принято пакетов",
      packets_bad: "Плохих пакетов",
      packets_relayed: "Ретранслировано пакетов"
    },
    channels: {
      title: "Каналы",
      name: "Имя",
      index: "Индекс",
      type: "Тип",
      uplink: "Восходящий канал",
      downlink: "Нисходящий канал",
      primary: "Основной",
      secondary: "Дополнительный"
    }
  },
  messages: {
    channels_header: "Каналы",
    dms_header: "Личные сообщения",
    channel_primary: "Основной",
    channel_name: "Канал {index}",
    clear_channel: "Очистить сообщения в этом канале",
    delete_conversation: "Удалить эту переписку",
    new_messages: {
      one: "{count} новое сообщение",
      few: "{count} новых сообщения",
      many: "{count} новых сообщений",
      other: "{count} нового сообщения"
    },
    hops: {
      direct: "Напрямую",
      count: {
        one: "{count} прыжок",
        few: "{count} прыжка",
        many: "{count} прыжков",
        other: "{count} прыжка"
      }
    },
    delivery: {
      delivered: "Доставлено",
      failed: "Ошибка",
      failed_with_error: "Ошибка: {error}",
      timeout: "Подтверждение не получено",
      sending: "Отправка…"
    },
    view_sender: "Открыть сведения об узле",
    reply: "Ответить",
    cancel_reply: "Отменить ответ",
    empty: {
      title: "Сообщений пока нет",
      hint: "Отправьте сообщение ниже или дождитесь сообщений из сети."
    },
    compose: {
      placeholder: "Введите сообщение…",
      reply_placeholder: "Ответить…",
      send: "Отправить",
      byte_counter: "{used}/{max} байт"
    },
    clear_dialog: {
      title: "Очистить переписку",
      message: "Удалить все сообщения в «{label}»? Это действие нельзя отменить.",
      confirm: "Очистить"
    }
  },
  nodes: {
    filters: {
      search_placeholder: "Поиск узлов по имени или ID...",
      toggle: "Фильтры",
      last_heard: "Последний сигнал",
      min_battery: "Мин. заряд %",
      max_hops: "Макс. прыжков",
      any: "Любое",
      source: "Источник",
      source_rf: "Только RF",
      source_mqtt: "Только MQTT",
      show: "Показать",
      all_nodes: "Все узлы",
      favorites_only: "Только избранные"
    },
    columns: {
      name: "Имя",
      hops: "Прыжки",
      battery: "Батарея",
      last_seen: "Последний раз в сети"
    },
    empty: {
      title: "Узлы сети ещё не обнаружены",
      hint: "Узлы появятся по мере их активности в сети.",
      no_matches: "Нет узлов, соответствующих фильтрам"
    },
    favorite: {
      add: "Добавить в избранное",
      remove: "Убрать из избранного"
    },
    badge: {
      ignored_short: "ИГН",
      ignored: "ИГНОРИРУЕТСЯ"
    },
    dialog: {
      identity: "Идентификация",
      node_id: "ID узла",
      short_name: "Краткое имя",
      long_name: "Полное имя",
      hardware: "Оборудование",
      last_seen: "Последний раз в сети",
      radio: "Радио",
      hops: "Прыжки",
      heard_via: "Получено через",
      heard_via_radio: "Радио",
      air_util_tx: "Исп. эфира TX",
      channel_utilization: "Исп. кан.",
      power: "Питание",
      battery: "Батарея",
      voltage: "Напряжение",
      uptime: "Время работы",
      environment: "Окружающая среда",
      temperature: "Температура",
      humidity: "Влажность",
      pressure: "Давление",
      position: "Позиция",
      latitude: "Широта",
      longitude: "Долгота",
      altitude: "Высота"
    },
    actions: {
      message: "Написать",
      trace_route: "Трассировка",
      tracing: "Трассировка...",
      request_position: "Запросить позицию",
      requesting: "Запрос...",
      view_on_map: "Показать на карте",
      request_info: "Запросить информацию",
      ignore: "Игнорировать",
      unignore: "Восстановить",
      remove: "Удалить",
      remove_confirm: "Удалить узел {name} из базы данных сети?"
    }
  },
  map: {
    load_failed: {
      title: "Ошибка загрузки карты",
      hint: "Не удалось загрузить библиотеку карт Leaflet."
    },
    loading: "Загрузка карты...",
    layers: {
      nodes: "Узлы ({count})",
      waypoints: "Точки ({count})",
      snr_lines: "Линии SNR",
      snr_lines_count: "Линии SNR ({count})",
      routes: "Маршруты",
      routes_count: "Маршруты ({count})",
      hide_mqtt: "Скрыть MQTT",
      hide_mqtt_title: "Скрыть узлы, полученные только через MQTT"
    },
    search_placeholder: "Найти узел…",
    search_not_found: "Нет узла с координатами по запросу",
    locate: "Где я",
    locate_title: "Найти моё местоположение",
    style: {
      light: "Светлая",
      light_title: "Светлая карта",
      dark: "Тёмная",
      dark_title: "Тёмная карта",
      satellite: "Спутник",
      satellite_title: "Спутниковые снимки"
    },
    nodes_without_position: {
      one: "{count} узел без позиции",
      few: "{count} узла без позиции",
      many: "{count} узлов без позиции",
      other: "{count} узла без позиции"
    },
    traceroute: {
      title: "Трассировка: {source} → {destination}",
      direct: "Прямое подключение",
      intermediate_hops: {
        one: "{count} промежуточный прыжок",
        few: "{count} промежуточных прыжка",
        many: "{count} промежуточных прыжков",
        other: "{count} промежуточного прыжка"
      },
      source: "Источник",
      destination: "Назначение",
      hop: "Прыжок {index}",
      return_route: "Обратный маршрут (другой путь)"
    },
    waypoint: {
      add: "Добавить точку",
      create_title: "Создать точку маршрута",
      name_label: "Название *",
      name_placeholder: "Название точки",
      description_label: "Описание",
      description_placeholder: "Описание (необязательно)",
      expire_label: "Срок действия (часы, 0 = бессрочно)",
      broadcast: "Широковещание в сеть",
      fallback_name: "Точка {id}",
      from: "От: {from}"
    },
    snr_tooltip: "{name}: SNR {snr} дБ",
    route_tooltip: {
      one: "Маршрут до {name} ({count} прыжок)",
      few: "Маршрут до {name} ({count} прыжка)",
      many: "Маршрут до {name} ({count} прыжков)",
      other: "Маршрут до {name} ({count} прыжка)"
    }
  }
};
