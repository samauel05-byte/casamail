#!/bin/bash
# Prueba del motor de correo de Android en una JVM normal, contra los servidores IMAP/SMTP de prueba. Uso: android/test/ejecutar.sh (desde la raíz del repo)
set -e
D=${TMPDIR:-/tmp}/cm-jvm; mkdir -p $D; cd $D
M=https://repo1.maven.org/maven2
[ -f mail.jar ] || curl -fsSL -o mail.jar $M/com/sun/mail/android-mail/1.6.7/android-mail-1.6.7.jar
[ -f act.jar ] || curl -fsSL -o act.jar $M/com/sun/mail/android-activation/1.6.7/android-activation-1.6.7.jar
[ -f json.jar ] || curl -fsSL -o json.jar $M/org/json/json/20240303/json-20240303.jar
R=$OLDPWD; CP=mail.jar:act.jar:json.jar
pkill -f servers-run >/dev/null 2>&1 || true
(cd $R && npx tsx tests/servers-run.ts > $D/srv.log 2>&1 &)
sleep 6
rm -rf out; mkdir out
javac -encoding UTF-8 -cp $CP -d out $R/android/app/src/main/java/app/casamail/movil/core/*.java $R/android/test/CorreoTest.java
java -Dfile.encoding=UTF-8 -cp out:$CP CorreoTest | tee $D/res.txt
pkill -f servers-run >/dev/null 2>&1 || true
grep -q " 0 fallos" $D/res.txt
