/* English strings — the fallback for every other locale. Keys are grouped by tab. */
export default {
  common: {
    save: "Save",
    cancel: "Cancel",
    close: "Close",
    delete: "Delete",
    confirm: "Confirm",
    loading: "Loading…",
    unknown: "Unknown",
    none: "None",
    yes: "Yes",
    no: "No",
    enabled: "Enabled",
    disabled: "Disabled",
    retry: "Retry",
    search: "Search",
    refresh: "Refresh"
  },
  modules: {
    update_interval_secs: "Update Interval (secs)",
    options: {
      default: "Default",
      simple: "Simple",
      text_message: "Text Message",
      up_down_select: "Up/Down/Select",
      rotary_encoder: "Rotary Encoder",
      bitrate_bps: "{rate} bps"
    },
    mqtt: {
      title: "MQTT Configuration",
      subtitle: "Configure MQTT broker connection, encryption, and map reporting.",
      enabled: "MQTT Enabled",
      enabled_desc: "Enable MQTT client on this device",
      broker: "Broker",
      address: "Address",
      address_desc: "MQTT broker hostname or IP",
      port: "Port",
      username: "Username",
      password: "Password",
      root_topic: "Root Topic",
      root_topic_desc: "MQTT root topic",
      options: "Options",
      encryption: "Encryption Enabled",
      encryption_desc: "Encrypt MQTT traffic",
      json: "JSON Enabled",
      json_desc: "Send JSON-formatted messages to MQTT",
      tls: "TLS Enabled",
      tls_desc: "Use TLS for broker connection",
      proxy_to_client: "Proxy to Client Enabled",
      proxy_to_client_desc: "Proxy MQTT traffic through connected client",
      map_reporting: "Map Reporting Enabled",
      map_reporting_desc: "Report position to the Meshtastic map"
    },
    serial: {
      title: "Serial Module",
      subtitle: "Configure the serial interface module for external device communication.",
      enabled_desc: "Enable serial module",
      baud_rate: "Baud Rate",
      mode: "Mode",
      mode_desc: "Serial communication protocol",
      rx_gpio: "RX GPIO",
      tx_gpio: "TX GPIO",
      timeout: "Timeout (ms)",
      timeout_desc: "Serial timeout in milliseconds",
      echo: "Echo",
      echo_desc: "Echo received serial data back",
      override_console: "Override Console Serial Port",
      override_console_desc: "Use the main serial port for this module"
    },
    ext_notification: {
      title: "External Notification",
      subtitle: "Configure buzzer, vibration motor, and LED notifications.",
      enabled_desc: "Enable external notification module",
      output: "Output",
      output_gpio: "Output GPIO",
      output_gpio_desc: "GPIO pin for notification output",
      output_vibra: "Output Vibra GPIO",
      output_vibra_desc: "GPIO for vibration motor",
      output_buzzer: "Output Buzzer GPIO",
      output_buzzer_desc: "GPIO for piezo buzzer",
      nag_timeout: "Nag Timeout (secs)",
      nag_timeout_desc: "Repeat notification interval (0 = once)",
      output_ms: "Output Duration (ms)",
      output_ms_desc: "Notification pulse duration",
      triggers: "Triggers",
      alert_message: "Alert on Message",
      alert_message_desc: "Notify on incoming messages",
      alert_message_buzzer: "Alert on Message Buzzer",
      alert_message_buzzer_desc: "Use buzzer for message alerts",
      alert_message_vibra: "Alert on Message Vibra",
      alert_message_vibra_desc: "Use vibration for message alerts",
      alert_bell: "Alert on Bell",
      alert_bell_desc: "Notify on bell character",
      alert_bell_buzzer: "Alert on Bell Buzzer",
      alert_bell_vibra: "Alert on Bell Vibra",
      use_pwm: "Use PWM Buzzer",
      use_pwm_desc: "Drive buzzer with PWM for tones",
      active_high: "Active High",
      active_high_desc: "Output is active-high (vs active-low)"
    },
    store_forward: {
      title: "Store & Forward",
      subtitle: "Store messages and forward them to nodes that come online later.",
      enabled_desc: "Enable Store & Forward module",
      records: "Records",
      records_desc: "Number of messages to store (0 = auto)",
      history_return_max: "History Return Max",
      history_return_max_desc: "Max messages to return on request",
      history_return_window: "History Return Window (secs)",
      history_return_window_desc: "Time window for history requests",
      heartbeat: "Heartbeat",
      heartbeat_desc: "Send periodic heartbeat to clients",
      is_server: "Is Server",
      is_server_desc: "Act as the S&F server for the mesh"
    },
    range_test: {
      title: "Range Test",
      subtitle: "Send periodic test messages to measure range and link quality.",
      enabled_desc: "Enable Range Test module",
      sender_interval: "Sender Interval (secs)",
      sender_interval_desc: "Seconds between test messages (0 = receive only)",
      save_to_file: "Save to File",
      save_to_file_desc: "Save received test data to file"
    },
    telemetry: {
      title: "Telemetry",
      subtitle: "Configure device metrics, environment, air quality, and power telemetry intervals.",
      device_metrics: "Device Metrics",
      banner_title: "Charts not updating?",
      banner_default: "Firmware 2.7.x defaults this to {default} (1 hour), which is why battery / channel utilization / airtime graphs may look frozen.",
      banner_advice: "For a live dashboard, set this to {five} (5 min) or {ten} (10 min).",
      preset_minutes: "{minutes} min",
      device_update_interval_desc: "How often the radio broadcasts device metrics. 0 uses the firmware default (3600s on fw 2.7.x).",
      environment: "Environment",
      environment_enabled: "Environment Measurement Enabled",
      environment_enabled_desc: "Enable environment sensor readings",
      environment_interval: "Environment Update Interval (secs)",
      environment_screen: "Environment Screen Enabled",
      show_on_screen_desc: "Show on screen (1 = yes)",
      air_quality: "Air Quality",
      air_quality_enabled: "Air Quality Enabled",
      air_quality_enabled_desc: "Enable air quality sensor readings",
      air_quality_interval: "Air Quality Interval (secs)",
      power_metrics: "Power Metrics",
      power_enabled: "Power Measurement Enabled",
      power_enabled_desc: "Enable power sensor readings (INA sensors)",
      power_interval: "Power Update Interval (secs)",
      power_screen: "Power Screen Enabled"
    },
    canned_message: {
      title: "Canned Messages",
      subtitle: "Pre-defined messages that can be sent quickly using hardware input.",
      enabled_desc: "Enable Canned Message module",
      messages: "Messages",
      messages_help: "One message per line. Use | to separate messages. Available on device input.",
      messages_placeholder: "Hello|On my way|Be right there",
      input_source: "Input Source",
      input_event_source: "Input Event Source",
      pin_a: "Input Pin A",
      pin_a_desc: "GPIO for rotary encoder / button A",
      pin_b: "Input Pin B",
      pin_b_desc: "GPIO for rotary encoder B",
      pin_press: "Input Pin Press",
      pin_press_desc: "GPIO for press/select",
      rotary_enabled: "Rotary Encoder Enabled",
      updown_enabled: "Up/Down Enabled",
      send_bell: "Send Bell",
      send_bell_desc: "Append a bell character so the receiving device alerts",
      allow_input_source: "Allow Input Source",
      allow_input_source_desc: "Allow message input from hardware"
    },
    audio: {
      title: "Audio / Codec2",
      subtitle: "Configure audio codec settings for voice communication over mesh.",
      codec2_enabled: "Codec2 Enabled",
      codec2_enabled_desc: "Enable Codec2 audio module",
      bitrate: "Bitrate",
      bitrate_desc: "Codec2 bitrate setting",
      ptt_gpio: "PTT GPIO",
      ptt_gpio_desc: "GPIO for push-to-talk button"
    },
    neighbor_info: {
      title: "Neighbor Info",
      subtitle: "Broadcast information about direct neighbors for mesh topology mapping.",
      enabled_desc: "Enable Neighbor Info module",
      update_interval_desc: "How often to broadcast neighbor info (0 = default)"
    },
    ambient_lighting: {
      title: "Ambient Lighting",
      subtitle: "Configure onboard LED color and brightness.",
      led_state: "LED State",
      led_state_desc: "Turn the LED on or off",
      red: "Red",
      red_desc: "Red channel (0-255)",
      green: "Green",
      green_desc: "Green channel (0-255)",
      blue: "Blue",
      blue_desc: "Blue channel (0-255)",
      current: "Current",
      current_desc: "LED brightness / current limit (0-31)"
    },
    detection_sensor: {
      title: "Detection Sensor",
      subtitle: "Configure a GPIO-based detection sensor that sends alerts on the mesh.",
      enabled_desc: "Enable Detection Sensor module",
      monitor_pin: "Monitor Pin",
      monitor_pin_desc: "GPIO pin to monitor for detection",
      min_broadcast_secs: "Minimum Broadcast Secs",
      min_broadcast_secs_desc: "Min interval between alert broadcasts",
      state_broadcast_secs: "State Broadcast Secs",
      state_broadcast_secs_desc: "Periodic state broadcast interval",
      triggered_high: "Detection Triggered High",
      triggered_high_desc: "Message when pin goes HIGH",
      triggered_low: "Detection Triggered Low",
      triggered_low_desc: "Message when pin goes LOW",
      send_bell: "Send Bell",
      send_bell_desc: "Send a bell notification with alerts",
      use_pullup: "Use Pullup",
      use_pullup_desc: "Enable internal pullup resistor"
    },
    paxcounter: {
      title: "Paxcounter",
      subtitle: "Count nearby WiFi and BLE devices and broadcast counts on the mesh.",
      enabled_desc: "Enable Paxcounter module",
      update_interval_desc: "How often to broadcast pax count (0 = default)",
      wifi_threshold: "WiFi Threshold",
      wifi_threshold_desc: "Enable WiFi device counting",
      ble_threshold: "BLE Threshold",
      ble_threshold_desc: "Enable BLE device counting"
    }
  },
  panel: {
    tabs: {
      radio: "Radio",
      messages: "Messages",
      nodes: "Nodes",
      map: "Map",
      settings: "Settings"
    },
    header: {
      sidebar_toggle: "Sidebar toggle"
    },
    reconnect: {
      reconnecting: "Reconnecting…",
      connection_lost: "Connection lost — click to reconnect"
    },
    feedback: {
      trace_route_unavailable: "Trace route unavailable",
      position_request_sent: "Position request sent",
      position_request_unavailable: "Position request unavailable",
      nodeinfo_request_sent: "Node info request sent",
      nodeinfo_request_unavailable: "Node info request unavailable",
      added_to_favorites: "Added to favorites",
      removed_from_favorites: "Removed from favorites",
      node_ignored: "Node ignored",
      node_unignored: "Node unignored",
      action_failed: "Action failed",
      node_removed: "Node removed",
      remove_failed: "Remove failed"
    },
    time: {
      just_now: "Just now",
      minutes_ago: "{count}m ago",
      hours_ago: "{count}h ago",
      days_ago: "{count}d ago",
      uptime_seconds: "{seconds}s",
      uptime_minutes: "{minutes}m",
      uptime_hours: "{hours}h {minutes}m",
      uptime_days: "{days}d {hours}h"
    },
    node_dialog: {
      confirm_remove: "Remove node {name}?",
      add_to_favorites: "Add to favorites",
      remove_from_favorites: "Remove from favorites",
      ignored_badge: "IGNORED",
      sections: {
        identity: "Identity",
        radio: "Radio",
        power: "Power",
        environment: "Environment",
        position: "Position"
      },
      metrics: {
        node_id: "Node ID",
        short_name: "Short Name",
        long_name: "Long Name",
        hardware: "Hardware",
        last_seen: "Last Seen",
        hops: "Hops",
        air_util_tx: "Air Util TX",
        channel_util: "Ch. Util",
        battery: "Battery",
        voltage: "Voltage",
        uptime: "Uptime",
        temperature: "Temperature",
        humidity: "Humidity",
        pressure: "Pressure",
        latitude: "Latitude",
        longitude: "Longitude",
        altitude: "Altitude"
      },
      actions: {
        message: "Message",
        tracing: "Tracing...",
        trace_route: "Trace Route",
        requesting: "Requesting...",
        request_position: "Request Position",
        view_on_map: "View on Map",
        request_info: "Request Info",
        ignore: "Ignore",
        unignore: "Unignore",
        remove: "Remove"
      }
    },
    traceroute: {
      timed_out_title: "Traceroute Timed Out",
      no_response: "No response from {name} after 30 seconds.",
      out_of_range_hint: "The node may be out of range or powered off.",
      title: "Traceroute: {source} → {destination}",
      direct_connection: "Direct connection",
      intermediate_hops: {
        one: "{count} intermediate hop",
        other: "{count} intermediate hops"
      },
      source: "Source",
      destination: "Destination",
      hop: "Hop {number}",
      return_route: "Return Route (different path)"
    },
    notifications: {
      title: "Notification Settings",
      enable: "Enable Notifications",
      service: "Notify Service",
      filter: "Message Filter",
      filter_all: "All Messages",
      filter_channel: "Channels Only",
      filter_dm: "Direct Messages Only"
    }
  },
  components: {
    password: {
      show: "Show",
      hide: "Hide"
    },
    save_bar: {
      unsaved_changes: "You have unsaved changes",
      discard: "Discard",
      saving: "Saving..."
    }
  },
  settings: {
    lora: {
      region: "Region",
      modem_preset: "Modem Preset",
      hop_limit: "Hop Limit",
      hop_limit_desc: "Max number of hops (1-7)",
      tx_power: "TX Power (dBm)",
      tx_power_desc: "Transmit power in dBm (0 = max for region)",
      frequency_offset: "Frequency Offset (Hz)",
      frequency_offset_desc: "Fine-tune frequency offset",
      bandwidth: "Bandwidth (kHz)",
      bandwidth_desc: "Override bandwidth (0 = use preset)",
      spread_factor: "Spread Factor",
      spread_factor_desc: "Override spread factor (0 = use preset)",
      coding_rate: "Coding Rate",
      coding_rate_desc: "Override coding rate (0 = use preset)",
      tx_enabled: "TX Enabled",
      tx_enabled_desc: "Allow radio to transmit",
      use_preset: "Use Preset",
      use_preset_desc: "Use the modem preset or custom values",
      override_duty_cycle: "Override Duty Cycle",
      override_duty_cycle_desc: "Override regional duty cycle limits (use with caution)",
      boosted_rx_gain: "Boosted RX Gain",
      boosted_rx_gain_desc: "Enable boosted RX gain on SX1262",
      title: "LoRa Configuration",
      subtitle: "Configure radio frequency, modem preset, and transmission settings.",
      presets: {
        long_fast: "Long Range / Fast",
        long_slow: "Long Range / Slow",
        long_moderate: "Long Range / Moderate",
        short_fast: "Short Range / Fast",
        short_slow: "Short Range / Slow",
        medium_fast: "Medium Range / Fast",
        medium_slow: "Medium Range / Slow"
      },
      regions: {
        unset: "Unset",
        lora_24: "2.4 GHz"
      }
    },
    channels: {
      role: "Role",
      name: "Name",
      name_placeholder: "Channel name",
      psk_placeholder: "Base64 encoded key",
      uplink_enabled: "Uplink Enabled",
      uplink_enabled_desc: "Forward packets from this channel to MQTT",
      downlink_enabled: "Downlink Enabled",
      downlink_enabled_desc: "Forward packets from MQTT to this channel",
      title: "Channels",
      subtitle: "Configure up to 8 channels. Each channel can have its own name and encryption key.",
      psk_heading: "Encryption Key (PSK)",
      roles: {
        disabled: "Disabled",
        primary: "Primary",
        secondary: "Secondary"
      },
      channel_title: "Channel {index}",
      channel_title_named: "Channel {index} — {name}",
      generate_psk: "Generate",
      discard: "Discard",
      saving: "Saving...",
      save_channel: "Save Channel"
    },
    user: {
      long_name: "Long Name",
      long_name_desc: "Your radio's display name on the mesh (max 39 chars)",
      long_name_placeholder: "My Meshtastic Radio",
      short_name: "Short Name",
      short_name_desc: "4-character abbreviation shown on compact displays",
      licensed_operator: "Licensed Operator",
      licensed_operator_desc: "If enabled, your node will use HAM mode with longer names and no encryption",
      title: "User Configuration",
      subtitle: "Set the name and identity of your radio node on the mesh."
    },
    device: {
      device_role: "Device Role",
      device_role_desc: "Determines how the device behaves on the mesh",
      rebroadcast_mode: "Rebroadcast Mode",
      rebroadcast_mode_desc: "Controls which messages this node rebroadcasts",
      node_info_broadcast_secs: "Node Info Broadcast Secs",
      node_info_broadcast_secs_desc: "How often to broadcast node info (seconds, 0 = default)",
      button_gpio: "Button GPIO",
      button_gpio_desc: "GPIO pin for user button (0 = default)",
      buzzer_gpio: "Buzzer GPIO",
      buzzer_gpio_desc: "GPIO pin for buzzer (0 = default)",
      double_tap_as_button_press: "Double Tap as Button Press",
      double_tap_as_button_press_desc: "Use double-tap on the device as a button press",
      led_heartbeat_disabled: "LED Heartbeat Disabled",
      led_heartbeat_disabled_desc: "Disable the LED heartbeat indicator",
      title: "Device Configuration",
      subtitle: "Configure the device role, rebroadcast mode, and hardware options.",
      roles: {
        client: "Client",
        client_mute: "Client Mute",
        client_hidden: "Client Hidden",
        client_base: "Client Base",
        router: "Router",
        router_late: "Router Late",
        router_client: "Router Client",
        repeater: "Repeater",
        tracker: "Tracker",
        sensor: "Sensor",
        tak: "TAK",
        tak_tracker: "TAK Tracker",
        lost_and_found: "Lost and Found"
      },
      rebroadcast_modes: {
        all: "All",
        all_skip_decoding: "All (Skip Decoding)",
        local_only: "Local Only",
        known_only: "Known Only",
        none: "None"
      }
    },
    position: {
      gps_mode: "GPS Mode",
      gps_mode_desc: "How the device obtains its position",
      position_broadcast_secs: "Position Broadcast Secs",
      position_broadcast_secs_desc: "How often to broadcast position (seconds, 0 = default)",
      broadcast_smart_min_distance: "Broadcast Smart Min Distance (m)",
      broadcast_smart_min_distance_desc: "Min distance to move before broadcasting (0 = disabled)",
      broadcast_smart_min_interval: "Broadcast Smart Min Interval (secs)",
      broadcast_smart_min_interval_desc: "Min interval between smart broadcasts",
      gps_update_interval: "GPS Update Interval (secs)",
      gps_update_interval_desc: "How often the GPS hardware checks position",
      rx_gpio: "RX GPIO",
      rx_gpio_desc: "GPIO pin for GPS RX (0 = default)",
      tx_gpio: "TX GPIO",
      tx_gpio_desc: "GPIO pin for GPS TX (0 = default)",
      fixed_position: "Fixed Position",
      fixed_position_desc: "Use a fixed position instead of GPS",
      latitude: "Latitude",
      longitude: "Longitude",
      altitude: "Altitude (m)",
      smart_position_broadcast: "Smart Position Broadcast",
      smart_position_broadcast_desc: "Only broadcast position when movement is detected",
      gps_enabled: "GPS Enabled",
      gps_enabled_desc: "Enable the onboard GPS hardware",
      title: "Position Configuration",
      subtitle: "Configure GPS, fixed position, and position broadcast settings.",
      fixed_position_heading: "Fixed Position",
      gps_modes: {
        disabled: "Disabled",
        enabled: "Enabled",
        not_present: "Not Present"
      }
    },
    power: {
      on_battery_shutdown_after: "On Battery Shutdown After (secs)",
      on_battery_shutdown_after_desc: "Auto-shutdown after this many seconds on battery (0 = disabled)",
      min_wake_secs: "Min Wake Secs",
      min_wake_secs_desc: "Minimum time to stay awake (seconds)",
      light_sleep_interval: "Light Sleep Interval (secs)",
      light_sleep_interval_desc: "Light sleep interval for power saving",
      wait_bluetooth_secs: "Wait Bluetooth Secs",
      wait_bluetooth_secs_desc: "Seconds to wait for Bluetooth before sleeping",
      adc_multiplier_override: "ADC Multiplier Override",
      adc_multiplier_override_desc: "Override voltage divider ratio for battery reading (0 = auto)",
      power_saving: "Power Saving",
      power_saving_desc: "Enable power saving mode (light sleep between operations)",
      title: "Power Configuration",
      subtitle: "Configure power saving, sleep behavior, and battery management."
    },
    network: {
      wifi_enabled: "WiFi Enabled",
      wifi_enabled_desc: "Enable WiFi connectivity",
      wifi_ssid: "WiFi SSID",
      wifi_ssid_placeholder: "Network name",
      wifi_password: "WiFi Password",
      wifi_password_placeholder: "Password",
      ethernet_enabled: "Ethernet Enabled",
      ethernet_enabled_desc: "Enable Ethernet connectivity",
      ipv4_address: "IPv4 Address",
      ipv4_address_desc: "Static IPv4 address (leave empty for DHCP)",
      gateway: "Gateway",
      subnet_mask: "Subnet Mask",
      dns_server: "DNS Server",
      ntp_server: "NTP Server",
      ntp_server_desc: "Custom NTP server address",
      syslog_server: "Syslog Server",
      syslog_server_desc: "Remote syslog server (host:port)",
      title: "Network Configuration",
      subtitle: "Configure WiFi, Ethernet, NTP server, and syslog settings.",
      ip_heading: "IP Configuration",
      services_heading: "Services"
    },
    display: {
      screen_on_secs: "Screen On Secs",
      screen_on_secs_desc: "How long the screen stays on (0 = always on)",
      auto_carousel_secs: "Auto Carousel Secs",
      auto_carousel_secs_desc: "Seconds between auto-cycling pages (0 = disabled)",
      display_units: "Display Units",
      display_mode: "Display Mode",
      display_mode_desc: "Color mode for the display",
      oled_type: "OLED Type",
      oled_type_desc: "OLED display hardware type",
      heading_bold: "Heading Bold",
      heading_bold_desc: "Use bold for heading text (0 = no, 1 = yes)",
      flip_screen: "Flip Screen",
      flip_screen_desc: "Rotate the display 180 degrees",
      wake_on_tap_or_motion: "Wake on Tap or Motion",
      wake_on_tap_or_motion_desc: "Wake the screen when motion is detected",
      compass_north_top: "Compass North Top",
      compass_north_top_desc: "Always orient compass with north at top",
      title: "Display Configuration",
      subtitle: "Configure screen timeout, units, OLED type, and display options.",
      modes: {
        default: "Default",
        twocolor: "Two Color",
        inverted: "Inverted",
        color: "Color"
      },
      units: {
        metric: "Metric",
        imperial: "Imperial"
      },
      oled_types: {
        auto: "Auto Detect"
      }
    },
    bluetooth: {
      bluetooth_enabled: "Bluetooth Enabled",
      bluetooth_enabled_desc: "Enable Bluetooth radio",
      pairing_mode: "Pairing Mode",
      pairing_mode_desc: "How the device pairs with Bluetooth clients",
      fixed_pin: "Fixed PIN",
      fixed_pin_desc: "6-digit pairing PIN",
      title: "Bluetooth Configuration",
      subtitle: "Configure Bluetooth connectivity, pairing mode, and PIN.",
      pairing_modes: {
        random_pin: "Random PIN",
        fixed_pin: "Fixed PIN",
        no_pin: "No PIN"
      }
    },
    security: {
      admin_channel_index: "Admin Channel Index",
      admin_channel_index_desc: "Channel index used for admin messages (0 = primary)",
      debug_log_enabled: "Debug Log Enabled",
      debug_log_enabled_desc: "Enable verbose debug logging on the device",
      admin_key_required: "Admin Key Required",
      admin_key_required_desc: "Require admin key for remote administration",
      serial_console_disabled: "Serial Console Disabled",
      serial_console_disabled_desc: "Disable serial console access for security",
      title: "Security Configuration",
      subtitle: "View PKI keys, configure admin channel, and debug logging settings.",
      pki_heading: "PKI Keys (Read Only)",
      key_set: "(set)",
      key_not_set: "(not set)",
      key_unavailable: "Not available",
      public_key: "Public Key",
      private_key: "Private Key"
    },
    options_heading: "Options",
    actions: {
      title: "Device Actions",
      subtitle: "Manage and control your Meshtastic radio device. Destructive actions require confirmation.",
      reboot: {
        name: "Reboot",
        desc: "Restart the radio device"
      },
      shutdown: {
        name: "Shutdown",
        desc: "Power off the radio device"
      },
      reset_nodedb: {
        name: "Reset NodeDB",
        desc: "Clear the mesh node database"
      },
      factory_reset_config: {
        name: "Factory Reset Config",
        desc: "Reset all configuration to defaults"
      },
      factory_reset_device: {
        name: "Full Factory Reset",
        desc: "Reset config and clear all data"
      },
      reboot_ota: {
        name: "Reboot to OTA",
        desc: "Reboot into OTA update mode"
      },
      confirm_message: "Are you sure you want to {action}?",
      confirm_message_danger: "Are you sure you want to {action}? This action cannot be undone.",
      command_sent: "{action} command sent successfully",
      command_failed: "Error: {action} command failed"
    },
    storage: {
      title: "Storage",
      subtitle: "Manage data this integration has stored locally in Home Assistant. Useful when switching to a new radio or starting fresh.",
      stats: {
        messages: "Messages",
        conversations: "Conversations",
        nodes: "Nodes",
        traceroutes: "Traceroutes",
        waypoints: "Waypoints"
      },
      clear_messages: {
        name: "Clear Message History",
        desc: "Delete all stored chat history (channels and DMs)"
      },
      clear_nodes: {
        name: "Clear Node History",
        desc: "Delete all tracked nodes and traceroute results"
      },
      clear_all: {
        name: "Clear All Stored Data",
        desc: "Wipe messages, nodes, traceroutes, waypoints, favorites, and ignored"
      },
      confirm_message: "Are you sure you want to {action}? This action cannot be undone.",
      done: "{action} done",
      failed: "Error: {action} failed"
    },
    load_error: "Failed to load config from radio. Is the radio connected?",
    loading_config: "Loading radio configuration...",
    select_panel: "Select a settings panel",
    nav: {
      groups: {
        radio_config: "Radio Config",
        device_config: "Device Config",
        module_config: "Module Config",
        device: "Device",
        local_data: "Local Data"
      },
      lora: "LoRa",
      channels: "Channels",
      user: "User",
      device: "Device",
      position: "Position",
      power: "Power",
      network: "Network",
      display: "Display",
      bluetooth: "Bluetooth",
      security: "Security",
      mqtt: "MQTT",
      serial: "Serial",
      ext_notification: "Ext. Notification",
      store_forward: "Store & Forward",
      range_test: "Range Test",
      telemetry: "Telemetry",
      canned_message: "Canned Messages",
      audio: "Audio",
      neighbor_info: "Neighbor Info",
      ambient_lighting: "Ambient Lighting",
      detection_sensor: "Detection Sensor",
      paxcounter: "Paxcounter",
      actions: "Device Actions",
      storage: "Storage"
    }
  },
  views: {
    date: {
      today: "Today",
      yesterday: "Yesterday"
    },
    time: {
      just_now: "Just now",
      minutes_ago: "{minutes}m ago",
      hours_ago: "{hours}h ago",
      days_ago: "{days}d ago"
    },
    duration: {
      seconds: "{seconds}s",
      minutes: "{minutes}m",
      hours_minutes: "{hours}h {minutes}m",
      days_hours: "{days}d {hours}h"
    },
    window: {
      "1h": "Last Hour",
      "6h": "Last 6 Hours",
      "24h": "Last 24 Hours",
      "7d": "Last 7 Days",
      all_time: "All Time",
      custom: "Custom"
    },
    chart: {
      now: "now",
      seconds_ago: "-{seconds}s ago",
      minutes_ago: "-{minutes}m ago",
      hours_ago: "-{hours}h ago",
      days_ago: "-{days}d ago",
      axis_minutes: "-{minutes}m",
      axis_hours: "-{hours}h",
      axis_days: "-{days}d",
      loading: "Loading D3...",
      no_packets: "No packets received yet"
    },
    packet_types: {
      text: "Text",
      position: "Position",
      telemetry: "Telemetry",
      nodeinfo: "Node Info",
      routing: "Routing",
      other_type: "Other"
    }
  },
  radio: {
    empty: {
      title: "No Meshtastic radio connected",
      hint: "Check the radio connection in the integration settings."
    },
    charts: {
      activity_heading: "{window} Activity",
      telemetry_interval_hint: "Radio broadcasts device metrics on this interval. Change in Settings → Telemetry.",
      packets_per_minutes: "pkts/{minutes}min",
      packets_per_seconds: "pkts/{seconds}s",
      channel_utilization: "Channel Utilization",
      airtime_tx: "Airtime TX",
      battery: "Battery",
      packets_tx: "Packets TX",
      packets_rx: "Packets RX",
      packets_by_type: "Packets by Type"
    },
    interval: {
      firmware_default: "every 1h (fw default)",
      seconds: "every {seconds}s",
      minutes: "every {minutes} min",
      hours: "every {hours}h"
    },
    switch_radio: "Switch active radio",
    default_name: "Meshtastic Radio",
    other_radio_unread: "Another radio has new messages",
    uptime: "Up {uptime}",
    reconnect: {
      title: "Force reconnect to radio",
      in_progress: "Reconnecting…",
      button: "Reconnect"
    },
    metrics: {
      title: "Metrics",
      battery: "Battery",
      voltage: "Voltage",
      channel_utilization: "Ch. Utilization",
      airtime: "Airtime",
      packets_tx: "Packets TX",
      packets_rx: "Packets RX",
      packets_bad: "Packets Bad",
      packets_relayed: "Packets Relayed"
    },
    channels: {
      title: "Channels",
      name: "Name",
      index: "Index",
      type: "Type",
      uplink: "Uplink",
      downlink: "Downlink",
      primary: "Primary",
      secondary: "Secondary"
    }
  },
  messages: {
    channels_header: "Channels",
    dms_header: "Direct Messages",
    channel_primary: "Primary",
    channel_name: "Channel {index}",
    clear_channel: "Clear messages in this channel",
    delete_conversation: "Delete this conversation",
    new_messages: {
      one: "{count} new message",
      other: "{count} new messages"
    },
    hops: {
      direct: "Direct",
      count: {
        one: "{count} hop",
        other: "{count} hops"
      }
    },
    delivery: {
      delivered: "Delivered",
      failed: "Failed",
      failed_with_error: "Failed: {error}",
      timeout: "No acknowledgement received",
      sending: "Sending…"
    },
    view_sender: "View node details",
    reply: "Reply",
    cancel_reply: "Cancel reply",
    empty: {
      title: "No messages yet",
      hint: "Send a message below or wait for messages from the mesh."
    },
    compose: {
      placeholder: "Type a message…",
      reply_placeholder: "Reply…",
      send: "Send",
      byte_counter: "{used}/{max} bytes"
    },
    clear_dialog: {
      title: "Clear conversation",
      message: "Delete all messages in \"{label}\"? This action cannot be undone.",
      confirm: "Clear"
    }
  },
  nodes: {
    filters: {
      search_placeholder: "Search nodes by name or ID...",
      toggle: "Filters",
      last_heard: "Last Heard",
      min_battery: "Min Battery %",
      max_hops: "Max Hops",
      any: "Any",
      source: "Source",
      source_rf: "RF Only",
      source_mqtt: "MQTT Only",
      show: "Show",
      all_nodes: "All Nodes",
      favorites_only: "Favorites Only"
    },
    columns: {
      name: "Name",
      hops: "Hops",
      battery: "Battery",
      last_seen: "Last Seen"
    },
    empty: {
      title: "No mesh nodes discovered yet",
      hint: "Nodes will appear as they communicate on the mesh.",
      no_matches: "No nodes match the current filters"
    },
    favorite: {
      add: "Add to favorites",
      remove: "Remove from favorites"
    },
    badge: {
      ignored_short: "IGN",
      ignored: "IGNORED"
    },
    dialog: {
      identity: "Identity",
      node_id: "Node ID",
      short_name: "Short Name",
      long_name: "Long Name",
      hardware: "Hardware",
      last_seen: "Last Seen",
      radio: "Radio",
      hops: "Hops",
      heard_via: "Heard Via",
      heard_via_radio: "Radio",
      air_util_tx: "Air Util TX",
      channel_utilization: "Ch. Util",
      power: "Power",
      battery: "Battery",
      voltage: "Voltage",
      uptime: "Uptime",
      environment: "Environment",
      temperature: "Temperature",
      humidity: "Humidity",
      pressure: "Pressure",
      position: "Position",
      latitude: "Latitude",
      longitude: "Longitude",
      altitude: "Altitude"
    },
    actions: {
      message: "Message",
      trace_route: "Trace Route",
      tracing: "Tracing...",
      request_position: "Request Position",
      requesting: "Requesting...",
      view_on_map: "View on Map",
      request_info: "Request Info",
      ignore: "Ignore",
      unignore: "Unignore",
      remove: "Remove",
      remove_confirm: "Remove node {name} from the mesh database?"
    }
  },
  map: {
    load_failed: {
      title: "Failed to load map",
      hint: "Could not load Leaflet mapping library."
    },
    loading: "Loading map...",
    layers: {
      nodes: "Nodes ({count})",
      waypoints: "Waypoints ({count})",
      snr_lines: "SNR Lines",
      snr_lines_count: "SNR Lines ({count})",
      routes: "Routes",
      routes_count: "Routes ({count})",
      hide_mqtt: "Hide MQTT",
      hide_mqtt_title: "Hide nodes only heard via MQTT"
    },
    search_placeholder: "Find node…",
    search_not_found: "No node with a position matches",
    locate: "Locate",
    locate_title: "Find my location",
    style: {
      light: "Light",
      light_title: "Light map",
      dark: "Dark",
      dark_title: "Dark map",
      satellite: "Satellite",
      satellite_title: "Satellite imagery"
    },
    nodes_without_position: {
      one: "{count} node without position",
      other: "{count} nodes without position"
    },
    traceroute: {
      title: "Traceroute: {source} → {destination}",
      direct: "Direct connection",
      intermediate_hops: {
        one: "{count} intermediate hop",
        other: "{count} intermediate hops"
      },
      source: "Source",
      destination: "Destination",
      hop: "Hop {index}",
      return_route: "Return Route (different path)"
    },
    waypoint: {
      add: "Add waypoint",
      create_title: "Create Waypoint",
      name_label: "Name *",
      name_placeholder: "Waypoint name",
      description_label: "Description",
      description_placeholder: "Optional description",
      expire_label: "Expire (hours, 0 = never)",
      broadcast: "Broadcast to Mesh",
      fallback_name: "Waypoint {id}",
      from: "From: {from}"
    },
    snr_tooltip: "{name}: {snr} dB SNR",
    route_tooltip: {
      one: "Route to {name} ({count} hop)",
      other: "Route to {name} ({count} hops)"
    }
  }
};
