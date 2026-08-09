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
    // ČAS
    // =====================================================

    function timeToMinutes(time) {

        if (!time) {
            return 0;
        }

        const parts = String(time).split(":");

        if (parts.length !== 2) {
            return 0;
        }

        return (
            Number(parts[0]) * 60 +
            Number(parts[1])
        );
    }


    function minutesToTime(minutes) {

        minutes =
            ((minutes % 1440) + 1440) % 1440;

        const h =
            Math.floor(minutes / 60);

        const m =
            minutes % 60;

        return (
            String(h).padStart(2, "0") +
            ":" +
            String(m).padStart(2, "0")
        );
    }


    // =====================================================
    // NORMALIZACE ZASTÁVKY
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
    // 21
    // 41S
    // =====================================================

    function parseDeparture(value) {

        const text =
            String(value).trim();

        const isShortTrip =
            text.toUpperCase().endsWith("S");

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
            minute,
            isShortTrip
        };
    }


    // =====================================================
    // VYTVOŘENÍ SPOJŮ
    // =====================================================

    function createTrips(
        line,
        direction,
        dayType
    ) {

        const trips = [];

        // ochrana proti špatnému názvu dne
        let timetable =
            direction[dayType];

        if (!timetable) {

            if (dayType === "weekend") {
                timetable =
                    direction.weekends;
            }

            if (dayType === "weekday") {
                timetable =
                    direction.weekdays;
            }
        }

        if (!timetable) {
            return trips;
        }


        // =================================================
        // KAŽDÁ HODINA
        // =================================================

        for (
            const hour of Object.keys(timetable)
        ) {

            const departures =
                timetable[hour];

            if (!Array.isArray(departures)) {
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
                    Number(hour) * 60 +
                    parsed.minute;


                // =================================================
                // CELÁ TRASA
                // =================================================

                let stopCount =
                    direction.stops.length;

                let destination =
                    direction.destination;


                // =================================================
                // SPOJ S
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

                    const travelTime =
                        Number(
                            direction.travelTimes[i]
                        );


                    if (
                        !stopName ||
                        !Number.isFinite(
                            travelTime
                        )
                    ) {
                        continue;
                    }


                    const absoluteTime =
                        firstTime +
                        travelTime;


                    stops.push({

                        name:
                            stopName,

                        time:
                            minutesToTime(
                                absoluteTime
                            ),

                        minutes:
                            absoluteTime
                    });
                }


                if (
                    stops.length < 2
                ) {
                    continue;
                }


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
    // NAČTENÍ SPOJŮ LINKY
    // =====================================================

    async function getTrips(
        line,
        dayType
    ) {

        const timetable =
            await loadTimetable(line);

        const trips = [];


        for (
            const direction
            of timetable.directions || []
        ) {

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
    // NAJDI ÚSEK MEZI ZASTÁVKAMI
    // =====================================================

    function getSegment(
        trip,
        from,
        to
    ) {

        const fromIndex =
            trip.stops.findIndex(
                stop =>
                    normalizeStop(
                        stop.name
                    ) ===
                    normalizeStop(from)
            );


        const toIndex =
            trip.stops.findIndex(
                stop =>
                    normalizeStop(
                        stop.name
                    ) ===
                    normalizeStop(to)
            );


        if (
            fromIndex === -1 ||
            toIndex === -1
        ) {
            return null;
        }


        // nesmí jet proti směru
        if (
            fromIndex >= toIndex
        ) {
            return null;
        }


        return {

            stops:
                trip.stops.slice(
                    fromIndex,
                    toIndex + 1
                ),

            departure:
                trip.stops[
                    fromIndex
                ].time,

            departureMinutes:
                trip.stops[
                    fromIndex
                ].minutes,

            arrival:
                trip.stops[
                    toIndex
                ].time,

            arrivalMinutes:
                trip.stops[
                    toIndex
                ].minutes
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


            // =============================================
            // ODJEZDY
            // =============================================

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


            // =============================================
            // PŘÍJEZDY
            // =============================================

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
    // DUPLICITY
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


            seen.add(key);

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
            "VYHLEDÁVÁNÍ:",
            from,
            "→",
            to,
            afterTime,
            dayType
        );


        if (
            !from ||
            !to
        ) {
            return [];
        }


        if (
            !Array.isArray(lineNumbers) ||
            lineNumbers.length === 0
        ) {

            console.error(
                "Nejsou předány žádné linky."
            );

            return [];
        }


        const wantedTime =
            timeToMinutes(
                afterTime
            );


        // =================================================
        // NAČTENÍ
        // =================================================

        const allTrips =
            await loadAllTrips(
                lineNumbers,
                dayType
            );


        if (
            allTrips.length === 0
        ) {

            console.error(
                "Nebyl načten žádný spoj."
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


        direct =
            removeDuplicates(
                direct
            );


        // =================================================
        // SEŘAZENÍ
        // =================================================

        if (
            mode === "departure"
        ) {

            direct.sort(
                (a, b) =>
                    a.departureMinutes -
                    b.departureMinutes
            );

        } else {

            direct.sort(
                (a, b) =>
                    b.arrivalMinutes -
                    a.arrivalMinutes
            );
        }


        console.log(
            "NALEZENÉ PŘÍMÉ SPOJE:",
            direct
        );


        // =================================================
        // ZATÍM VRACÍME PŘÍMÉ
        //
        // Přestupy přidáme až když bude jisté,
        // že přímé spoje fungují.
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

        loadTimetable,

        findConnections,

        findDirectConnections

    };

})();
