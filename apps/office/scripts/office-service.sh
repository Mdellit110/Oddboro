#!/bin/zsh
# Runs the office as a login service, so staff keep working with no terminal
# open. caffeinate -s keeps the Mac awake while it is on power and the office
# runs. Logs go to ~/Library/Logs/oddboro-office.log.
#
#   npm run service:install -w apps/office     start now and at every login
#   npm run service:uninstall -w apps/office   stop it and remove it
set -euo pipefail

LABEL=com.oddboro.office
PLIST=~/Library/LaunchAgents/$LABEL.plist
OFFICE=${0:A:h:h}
REPO=${OFFICE:h:h}
LOG=~/Library/Logs/oddboro-office.log

if [[ ${1:-} == uninstall ]]; then
  launchctl bootout gui/$UID/$LABEL 2>/dev/null || true
  rm -f $PLIST
  echo "The office service is off."
  exit 0
fi

# The service gets this shell's PATH, so it finds node, claude and uvx the
# same way a terminal does.
cat > $PLIST <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>WorkingDirectory</key><string>$OFFICE</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/caffeinate</string>
    <string>-s</string>
    <string>$REPO/node_modules/.bin/vite</string>
    <string>dev</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$PATH</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST

launchctl bootout gui/$UID/$LABEL 2>/dev/null || true
launchctl bootstrap gui/$UID $PLIST
echo "The office runs at login now: http://127.0.0.1:4500"
