// search.js

window.searchTimetable = (() => {

    const cache = new Map();

    // =====================================================
    // NAČTENÍ JÍZDNÍHO ŘÁDU
    // =====================================================

    async function loadTimetable(line) {

        line = String(line).trim();

        if (cache.has(line)) {
            return cache.get(line);
        }

        const response = await fetch(
            `data/timetables/${encodeURIComponent(line)}.json`
        );

        if (!response.ok) {
            throw new Error(
                `Nelze načíst linku ${line}: HTTP ${response.status}`
            );
        }

        const data = await response.json();

        cache.set(line, data);

        return data;
    }


    // =====================================================
    // ČAS → MINUTY
    // =====================================================

    function timeToMinutes(time) {

        if (!time) {
            return 0;
        }

        const parts =
            String(time).trim().split(":");

        if (parts.length !== 2) {
            return 0;
        }

        const hours =
            Number(parts[0]);

        const minutes =
            Number(parts[1]);

        if (
            !Number.isFinite(hours) ||
            !Number.isFinite(minutes)
        ) {
            return 0;
        }

        return (
            hours * 60 +
            minutes
        );
    }


    // =====================================================
    // MINUTY → ČAS
    // =====================================================

    function minutesToTime(minutes) {

        minutes =
            ((minutes % 1440) + 1440) % 1440;

        const hours =
            Math.floor(minutes / 60);

        const mins =
            minutes % 60;

        return (
            String(hours).padStart(2, "0") +
            ":" +
            String(mins).padStart(2, "0")
        );
    }


    // =====================================================
    // NORMALIZACE NÁZVU ZASTÁVKY
    // =====================================================

    function normalizeStop(name) {

        return String(name)
            .trim()
            .toLowerCase()
            .replace(/\s+/g, " ");
    }


    // =====================================================
    // ODJEZD
    //
    // Podporuje:
    //
    // 6
    // 36
    // "36"
    // "36S"
    //
    // S = spoj končící na Sminov, u lávky
    // =====================================================

    function parseDeparture(value) {

        // číslo
        if (typeof value === "number") {

            if (
                !Number.isFinite(value) ||
                value < 0 ||
                value > 59
            ) {
                return null;
            }

            return {
                minute: value,
                isShortTrip: false
            };
        }


        // text
        const text =
            String(value)
                .trim()
                .toUpperCase();


        const isShortTrip =
            text.endsWith("S");


        const numberText =
            isShortTrip
                ? text.slice(0, -1)
                : text;


        const minute =
            Number(numberText);


        if (
            !Number.isFinite(minute) ||
            minute < 0 ||
            minute > 59
        ) {
            return null;
        }


        return {

            minute:
                minute,

            isShortTrip:
                isShortTrip
        };
    }


    // =====================================================
    // VYTVOŘENÍ VŠECH SPOJŮ JEDNÉHO SMĚRU
    // =====================================================

    function createTrips(
        line,
        direction,
        dayType
    ) {

        const trips = [];


        // =================================================
        // JÍZDNÍ ŘÁD PRO DANÝ DEN
        // =================================================

        let timetable =
            direction[dayType];


        // pojistky
        if (!timetable) {

            if (
                dayType === "weekday" ||
                dayType === "workdays" ||
                dayType === "weekdays"
            ) {

                timetable =
                    direction.weekdays;
            }


            if (
                dayType === "weekend" ||
                dayType === "weekends"
            ) {

                timetable =
                    direction.weekends;
            }
        }


        if (
            !timetable ||
            typeof timetable !== "object"
        ) {

            console.warn(
                "Chybí jízdní řád:",
                line,
                direction.id,
                dayType
            );

            return trips;
        }


        // =================================================
        // KAŽDÁ HODINA
        // =================================================

        for (
            const hourKey
            of Object.keys(timetable)
        ) {

            const hour =
                Number(hourKey);


            if (
                !Number.isFinite(hour)
            ) {
                continue;
            }


            const departures =
                timetable[hourKey];


            if (
                !Array.isArray(departures)
            ) {
                continue;
            }


            // =================================================
            // KAŽDÝ ODJEZD
            // =================================================

            for (
                const departureValue
                of departures
            ) {

                const parsed =
                    parseDeparture(
                        departureValue
                    );


                if (!parsed) {
                    continue;
                }


                const firstTime =
                    hour * 60 +
                    parsed.minute;


                // =================================================
                // VÝCHOZÍ CELÁ TRASA
                // =================================================

                let stopCount =
                    Array.isArray(direction.stops)
                        ? direction.stops.length
                        : 0;


                let destination =
                    direction.destination ||
                    (
                        direction.stops &&
                        direction.stops.length
                            ? direction.stops[
                                direction.stops.length - 1
                              ]
                            : ""
                    );


                // =================================================
                // SPOJ S
                //
                // Končí na:
                // Sminov, u lávky
                // =================================================

                if (
                    parsed.isShortTrip
                ) {

                    const shortIndex =
                        direction.stops.findIndex(
                            stop =>
                                normalizeStop(stop) ===
                                normalizeStop(
                                    "Sminov, u lávky"
                                )
                        );


                    if (
                        shortIndex !== -1
                    ) {

                        stopCount =
                            shortIndex + 1;


                        destination =
                            "Sminov, u lávky";
                    }
                }


                // =================================================
                // VYTVOŘENÍ ZASTÁVEK
                // =================================================

                const stops = [];


                for (
                    let i = 0;
                    i < stopCount;
                    i++
                ) {

                    const stopName =
                        direction.stops[i];


                    if (!stopName) {
                        continue;
                    }


                    let travelTime =
                        Number(
                            direction.travelTimes?.[i]
                        );


                    // Pokud je čas špatně zadaný,
                    // první zastávka je 0 minut.
                    if (
                        !Number.isFinite(
                            travelTime
                        )
                    ) {

                        travelTime =
                            i === 0
                                ? 0
                                : 0;
                    }


                    const absoluteTime =
                        firstTime +
                        travelTime;


                    stops.push({

                        name:
                            stopName,

                        minutes:
                            absoluteTime,

                        time:
                            minutesToTime(
                                absoluteTime
                            )
                    });
                }


                // =================================================
                // SPOJ MUSÍ MÍT ALESPOŇ 2 ZASTÁVKY
                // =================================================

                if (
                    stops.length < 2
                ) {
                    continue;
                }


                // =================================================
                // SPOJ
                // =================================================

                trips.push({

                    id:
                        `${line}-${direction.id}-${firstTime}-${parsed.isShortTrip ? "S" : "N"}`,

                    line:
                        String(line),

                    directionId:
                        direction.id,

                    destination:
                        destination,

                    isShortTrip:
                        parsed.isShortTrip,

                    stops:
                        stops
                });
            }
        }


        return trips;
    }


    // =====================================================
    // NAČTENÍ SPOJŮ JEDNÉ LINKY
    // =====================================================

    async function getTrips(
        line,
        dayType
    ) {

        const timetable =
            await loadTimetable(
                line
            );


        const trips = [];


        if (
            !timetable ||
            !Array.isArray(
                timetable.directions
            )
        ) {

            console.warn(
                `Linka ${line} nemá directions.`
            );

            return trips;
        }


        for (
            const direction
            of timetable.directions
        ) {

            if (
                !direction ||
                !Array.isArray(
                    direction.stops
                )
            ) {
                continue;
            }


            trips.push(
                ...createTrips(
                    line,
                    direction,
                    dayType
                )
            );
        }


        return trips;
    }


    // =====================================================
    // NAČTENÍ VŠECH LINEK
    // =====================================================

    async function loadAllTrips(
        lineNumbers,
        dayType
    ) {

        const allTrips = [];


        for (
            const line
            of lineNumbers
        ) {

            try {

                const trips =
                    await getTrips(
                        line,
                        dayType
                    );


                allTrips.push(
                    ...trips
                );

            } catch (error) {

                console.warn(
                    `Linka ${line} se nepodařila načíst:`,
                    error
                );
            }
        }


        console.log(
            "CELKEM NAČTENÝCH SPOJŮ:",
            allTrips.length
        );


        return allTrips;
    }


    // =====================================================
    // NAJDE ÚSEK MEZI DVĚMA ZASTÁVKAMI
    // =====================================================

    function getSegment(
        trip,
        from,
        to
    ) {

        if (
            !trip ||
            !Array.isArray(
                trip.stops
            )
        ) {
            return null;
        }


        const fromNormalized =
            normalizeStop(
                from
            );


        const toNormalized =
            normalizeStop(
                to
            );


        const fromIndex =
            trip.stops.findIndex(
                stop =>
                    normalizeStop(
                        stop.name
                    ) ===
                    fromNormalized
            );


        const toIndex =
            trip.stops.findIndex(
                stop =>
                    normalizeStop(
                        stop.name
                    ) ===
                    toNormalized
            );


        if (
            fromIndex === -1 ||
            toIndex === -1
        ) {
            return null;
        }


        // opačný směr
        if (
            fromIndex >= toIndex
        ) {
            return null;
        }


        const segmentStops =
            trip.stops.slice(
                fromIndex,
                toIndex + 1
            );


        const departureStop =
            trip.stops[
                fromIndex
            ];


        const arrivalStop =
            trip.stops[
                toIndex
            ];


        return {

            stops:
                segmentStops,

            departure:
                departureStop.time,

            departureMinutes:
                departureStop.minutes,

            arrival:
                arrivalStop.time,

            arrivalMinutes:
                arrivalStop.minutes
        };
    }


    // =====================================================
    // PŘÍMÉ SPOJE
    // =====================================================

    function findDirectConnections(
        allTrips,
        from,
        to,
        wantedTime,
        mode
    ) {

        const results = [];


        for (
            const trip
            of allTrips
        ) {

            const segment =
                getSegment(
                    trip,
                    from,
                    to
                );


            if (!segment) {
                continue;
            }


            // =================================================
            // ODJEZDY
            // =================================================

            if (
                mode === "departure"
            ) {

                if (
                    segment.departureMinutes <
                    wantedTime
                ) {
                    continue;
                }
            }


            // =================================================
            // PŘÍJEZDY
            // =================================================

            if (
                mode === "arrival"
            ) {

                if (
                    segment.arrivalMinutes >
                    wantedTime
                ) {
                    continue;
                }
            }


            results.push({

                type:
                    "direct",

                line:
                    trip.line,

                directionId:
                    trip.directionId,

                destination:
                    trip.destination,

                isShortTrip:
                    trip.isShortTrip,

                from:
                    from,

                to:
                    to,

                departure:
                    segment.departure,

                arrival:
                    segment.arrival,

                departureMinutes:
                    segment.departureMinutes,

                arrivalMinutes:
                    segment.arrivalMinutes,

                stops:
                    segment.stops
            });
        }


        return results;
    }


    // =====================================================
    // ODSTRANĚNÍ DUPLICIT
    //
    // Stejný spoj v 6:44 se zobrazí pouze jednou.
    // =====================================================

    function removeDuplicates(
        connections
    ) {

        const seen =
            new Set();


        const result = [];


        for (
            const connection
            of connections
        ) {

            const key = [

                connection.type,

                connection.line,

                connection.departure,

                connection.arrival

            ].join("|");


            if (
                seen.has(key)
            ) {
                continue;
            }


            seen.add(
                key
            );


            result.push(
                connection
            );
        }


        return result;
    }


    // =====================================================
    // HLAVNÍ VYHLEDÁVÁNÍ
    // =====================================================

    async function findConnections(
        from,
        to,
        afterTime,
        dayType,
        lineNumbers,
        mode = "departure"
    ) {

        console.log(
            "=============================="
        );


        console.log(
            "HLEDÁM:",
            from,
            "→",
            to
        );


        console.log(
            "ČAS:",
            afterTime
        );


        console.log(
            "DEN:",
            dayType
        );


        console.log(
            "LINKY:",
            lineNumbers
        );


        // =================================================
        // KONTROLA
        // =================================================

        if (
            !from ||
            !to
        ) {
            return [];
        }


        if (
            !Array.isArray(
                lineNumbers
            ) ||
            lineNumbers.length === 0
        ) {

            console.error(
                "Nebyly předány žádné linky."
            );

            return [];
        }


        const wantedTime =
            timeToMinutes(
                afterTime ||
                "00:00"
            );


        // =================================================
        // NAČTENÍ VŠECH SPOJŮ
        // =================================================

        const allTrips =
            await loadAllTrips(
                lineNumbers,
                dayType
            );


        console.log(
            "NAČTENÉ SPOJE:",
            allTrips.length
        );


        if (
            allTrips.length === 0
        ) {

            console.error(
                "Nebyly načteny žádné spoje."
            );

            return [];
        }


        // =================================================
        // PŘÍMÉ SPOJE
        // =================================================

        let direct =
            findDirectConnections(
                allTrips,
                from,
                to,
                wantedTime,
                mode
            );


        // =================================================
        // DUPLICITY
        // =================================================

        direct =
            removeDuplicates(
                direct
            );


        // =================================================
        // SEŘAZENÍ
        // =================================================

        if (
            mode === "arrival"
        ) {

            direct.sort(
                (a, b) =>
                    b.arrivalMinutes -
                    a.arrivalMinutes
            );

        } else {

            direct.sort(
                (a, b) =>
                    a.departureMinutes -
                    b.departureMinutes
            );
        }


        console.log(
            "NALEZENÉ PŘÍMÉ SPOJE:",
            direct
        );


        // =================================================
        // VÝSLEDKY
        // =================================================

        return direct.slice(
            0,
            30
        );
    }


    // =====================================================
    // EXPORT
    // =====================================================

    return {

        loadTimetable:

            loadTimetable,

        findConnections:

            findConnections,

        findDirectConnections:

            findDirectConnections

    };

})();
