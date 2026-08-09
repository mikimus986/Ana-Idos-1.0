// search.js

window.searchTimetable = (() => {

    const cache = new Map();

    // =========================================================
    // NAČTENÍ JÍZDNÍHO ŘÁDU
    // =========================================================

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
                `Nepodařilo se načíst jízdní řád linky ${line}`
            );
        }

        const timetable = await response.json();

        cache.set(line, timetable);

        return timetable;
    }


    // =========================================================
    // PŘEVOD ČASU
    // =========================================================

    function timeToMinutes(time) {

        if (!time) {
            return 0;
        }

        const parts = String(time).split(":");

        const hours = Number(parts[0]);
        const minutes = Number(parts[1]);

        return hours * 60 + minutes;
    }


    function minutesToTime(totalMinutes) {

        totalMinutes = totalMinutes % 1440;

        if (totalMinutes < 0) {
            totalMinutes += 1440;
        }

        const hours =
            Math.floor(totalMinutes / 60);

        const minutes =
            totalMinutes % 60;

        return (
            String(hours).padStart(2, "0") +
            ":" +
            String(minutes).padStart(2, "0")
        );
    }


    // =========================================================
    // PARSOVÁNÍ ODJEZDU
    // =========================================================
    //
    // 41  = normální spoj
    // 41S = speciální spoj
    //
    // S znamená, že spoj končí v:
    // Sminov, u lávky
    // =========================================================

    function parseDeparture(value) {

        const text = String(value).trim();

        const isSpecial =
            text.toUpperCase().endsWith("S");

        const clean =
            isSpecial
                ? text.slice(0, -1)
                : text;

        const minute =
            Number(clean);

        if (
            Number.isNaN(minute) ||
            minute < 0 ||
            minute > 59
        ) {
            return null;
        }

        return {
            minute,
            isSpecial
        };
    }


    // =========================================================
    // NALEZENÍ INDEXU ZASTÁVKY
    // =========================================================

    function findStopIndex(stops, stopName) {

        if (!Array.isArray(stops)) {
            return -1;
        }

        const wanted =
            String(stopName)
                .trim()
                .toLowerCase();

        return stops.findIndex(
            stop =>
                String(stop)
                    .trim()
                    .toLowerCase() === wanted
        );
    }


    // =========================================================
    // VYTVOŘENÍ SPOJE Z JÍZDNÍHO ŘÁDU
    // =========================================================

    function buildTrip(
        line,
        direction,
        hour,
        departureData,
        dayType
    ) {

        if (!direction) {
            return null;
        }

        if (!Array.isArray(direction.stops)) {
            return null;
        }

        if (!Array.isArray(direction.travelTimes)) {
            return null;
        }

        const departureMinute =
            hour * 60 +
            departureData.minute;

        let stops =
            direction.stops.slice();

        let travelTimes =
            direction.travelTimes.slice();

        // =====================================================
        // SPECIÁLNÍ SPOJ S
        // =====================================================

        if (departureData.isSpecial) {

            const sIndex =
                findStopIndex(
                    stops,
                    "Sminov, u lávky"
                );

            if (sIndex !== -1) {

                stops =
                    stops.slice(
                        0,
                        sIndex + 1
                    );

                travelTimes =
                    travelTimes.slice(
                        0,
                        sIndex + 1
                    );
            }
        }


        // =====================================================
        // VYTVOŘENÍ ZASTÁVEK S ČASY
        // =====================================================

        const tripStops = [];

        for (
            let i = 0;
            i < stops.length;
            i++
        ) {

            const travelTime =
                Number(travelTimes[i]);

            if (Number.isNaN(travelTime)) {
                continue;
            }

            const absoluteTime =
                departureMinute +
                travelTime;

            tripStops.push({
                name: stops[i],
                time: minutesToTime(
                    absoluteTime
                ),
                minutes:
                    absoluteTime
            });
        }


        if (tripStops.length < 2) {
            return null;
        }


        let destination =
            direction.destination ||
            tripStops[tripStops.length - 1].name;


        // U speciálního spoje je skutečný cíl Sminov
        if (departureData.isSpecial) {

            const lastStop =
                tripStops[tripStops.length - 1];

            if (lastStop) {
                destination =
                    lastStop.name;
            }
        }


        return {

            line: String(line),

            directionId:
                direction.id || "",

            destination,

            isShortTrip:
                departureData.isSpecial,

            departure:
                tripStops[0].time,

            arrival:
                tripStops[tripStops.length - 1].time,

            departureMinutes:
                tripStops[0].minutes,

            arrivalMinutes:
                tripStops[tripStops.length - 1].minutes,

            from:
                tripStops[0].name,

            to:
                tripStops[tripStops.length - 1].name,

            stops:
                tripStops,

            dayType,

            // Jednoznačný identifikátor spoje
            tripId:
                String(line) +
                "|" +
                String(direction.id || "") +
                "|" +
                String(departureMinutes) +
                "|" +
                (departureData.isSpecial ? "S" : "")
        };
    }


    // =========================================================
    // VŠECHNY SPOJE PRO LINKU
    // =========================================================

    async function getTripsForLine(
        line,
        dayType
    ) {

        const timetable =
            await loadTimetable(line);

        if (
            !timetable ||
            !Array.isArray(timetable.directions)
        ) {
            return [];
        }

        const trips = [];

        for (
            const direction
            of timetable.directions
        ) {

            const schedule =
                timetable[
                    dayType
                ] &&
                timetable[
                    dayType
                ][
                    "6"
                ];

            // -------------------------------------------------
            // Časy jsou v timetable.directions?
            // Ne - podle tvého 1.json jsou v timetable
            // na úrovni weekdays/weekends.
            // -------------------------------------------------

            const daySchedule =
                timetable[dayType];

            if (!daySchedule) {
                continue;
            }

            for (
                const hourString
                of Object.keys(daySchedule)
            ) {

                const hour =
                    Number(hourString);

                const departures =
                    daySchedule[hourString];

                if (
                    !Array.isArray(departures)
                ) {
                    continue;
                }

                for (
                    const departureValue
                    of departures
                ) {

                    const departureData =
                        parseDeparture(
                            departureValue
                        );

                    if (!departureData) {
                        continue;
                    }

                    const trip =
                        buildTrip(
                            line,
                            direction,
                            hour,
                            departureData,
                            dayType
                        );

                    if (trip) {
                        trips.push(trip);
                    }
                }
            }
        }

        return trips;
    }


    // =========================================================
    // POZOR:
    // V JSON JE SCHEDULE UVNITŘ DIRECTIONS?
    //
    // Tvůj 1.json má weekdays/weekends v direction.
    // Proto používáme tuto funkci, která je přesnější.
    // =========================================================

    async function getTripsFromDirection(
        line,
        direction,
        dayType
    ) {

        const trips = [];

        const schedule =
            direction[dayType];

        if (!schedule) {
            return trips;
        }

        for (
            const hourString
            of Object.keys(schedule)
        ) {

            const hour =
                Number(hourString);

            const departures =
                schedule[hourString];

            if (!Array.isArray(departures)) {
                continue;
            }

            for (
                const departureValue
                of departures
            ) {

                const departureData =
                    parseDeparture(
                        departureValue
                    );

                if (!departureData) {
                    continue;
                }

                const trip =
                    buildTrip(
                        line,
                        direction,
                        hour,
                        departureData,
                        dayType
                    );

                if (trip) {
                    trips.push(trip);
                }
            }
        }

        return trips;
    }


    // =========================================================
    // NAČTENÍ VŠECH SPOJŮ
    // =========================================================

    async function getAllTrips(
        lineNumbers,
        dayType
    ) {

        const allTrips = [];

        for (
            const line
            of lineNumbers
        ) {

            try {

                const timetable =
                    await loadTimetable(line);

                if (
                    !timetable ||
                    !Array.isArray(
                        timetable.directions
                    )
                ) {
                    continue;
                }

                for (
                    const direction
                    of timetable.directions
                ) {

                    const trips =
                        await getTripsFromDirection(
                            line,
                            direction,
                            dayType
                        );

                    allTrips.push(
                        ...trips
                    );
                }

            } catch (error) {

                console.warn(
                    `Linka ${line}:`,
                    error
                );
            }
        }

        return allTrips;
    }


    // =========================================================
    // NALEZENÍ ÚSEKU
    // =========================================================

    function getSection(
        trip,
        from,
        to
    ) {

        const fromIndex =
            findStopIndex(
                trip.stops.map(s => s.name),
                from
            );

        const toIndex =
            findStopIndex(
                trip.stops.map(s => s.name),
                to
            );

        if (
            fromIndex === -1 ||
            toIndex === -1
        ) {
            return null;
        }

        if (fromIndex >= toIndex) {
            return null;
        }

        return {
            fromIndex,
            toIndex,
            stops:
                trip.stops.slice(
                    fromIndex,
                    toIndex + 1
                ),
            departure:
                trip.stops[fromIndex].time,
            arrival:
                trip.stops[toIndex].time,
            departureMinutes:
                trip.stops[fromIndex].minutes,
            arrivalMinutes:
                trip.stops[toIndex].minutes
        };
    }


    // =========================================================
    // PŘÍMÉ SPOJE
    // =========================================================

    function findDirectConnections(
        trips,
        from,
        to,
        afterMinutes,
        mode
    ) {

        const result = [];

        const used =
            new Set();

        for (
            const trip
            of trips
        ) {

            const section =
                getSection(
                    trip,
                    from,
                    to
                );

            if (!section) {
                continue;
            }


            let valid;

            if (mode === "arrival") {

                valid =
                    section.arrivalMinutes >=
                    afterMinutes;

            } else {

                valid =
                    section.departureMinutes >=
                    afterMinutes;
            }

            if (!valid) {
                continue;
            }


            // =================================================
            // STEJNÝ SPOJ POUZE JEDNOU
            // =================================================

            const uniqueKey =
                trip.line +
                "|" +
                trip.directionId +
                "|" +
                trip.departureMinutes +
                "|" +
                (trip.isShortTrip ? "S" : "") +
                "|" +
                from +
                "|" +
                to;

            if (used.has(uniqueKey)) {
                continue;
            }

            used.add(uniqueKey);


            result.push({

                ...trip,

                from:
                    from,

                to:
                    to,

                departure:
                    section.departure,

                arrival:
                    section.arrival,

                departureMinutes:
                    section.departureMinutes,

                arrivalMinutes:
                    section.arrivalMinutes,

                stops:
                    section.stops,

                isTransfer:
                    false,

                transferStop:
                    null
            });
        }


        // Nejprve nejdřívější odjezdy
        result.sort(
            (a, b) => {

                if (
                    mode === "arrival"
                ) {
                    return (
                        a.arrivalMinutes -
                        b.arrivalMinutes
                    );
                }

                return (
                    a.departureMinutes -
                    b.departureMinutes
                );
            }
        );


        // =====================================================
        // DALŠÍ DUPLICITY
        // Stejný čas + stejná linka = pouze jednou
        // =====================================================

        const finalResult = [];

        const seen =
            new Set();

        for (
            const connection
            of result
        ) {

            const key =
                connection.line +
                "|" +
                connection.directionId +
                "|" +
                connection.departureMinutes +
                "|" +
                connection.arrivalMinutes;

            if (seen.has(key)) {
                continue;
            }

            seen.add(key);

            finalResult.push(
                connection
            );
        }

        return finalResult;
    }


    // =========================================================
    // PRVNÍ SPOLEČNÁ ZASTÁVKA
    // =========================================================

    function findFirstCommonStop(
        firstTrip,
        secondTrip,
        from,
        to
    ) {

        const firstFrom =
            findStopIndex(
                firstTrip.stops.map(s => s.name),
                from
            );

        const secondTo =
            findStopIndex(
                secondTrip.stops.map(s => s.name),
                to
            );

        if (
            firstFrom === -1 ||
            secondTo === -1
        ) {
            return null;
        }


        // =====================================================
        // Hledáme společnou zastávku.
        //
        // DŮLEŽITÉ:
        // Vždy vybereme PRVNÍ společnou zastávku,
        // kterou lze použít pro přestup.
        // =====================================================

        for (
            let i = firstFrom + 1;
            i < firstTrip.stops.length;
            i++
        ) {

            const commonName =
                firstTrip.stops[i].name;

            const secondIndex =
                findStopIndex(
                    secondTrip.stops.map(
                        s => s.name
                    ),
                    commonName
                );

            if (
                secondIndex === -1
            ) {
                continue;
            }


            if (
                secondIndex >= secondTo
            ) {
                continue;
            }


            return {
                name:
                    commonName,

                firstIndex:
                    i,

                secondIndex
            };
        }

        return null;
    }


    // =========================================================
    // PŘESTUP
    // =========================================================

    function createTransfer(
        firstTrip,
        secondTrip,
        from,
        to,
        transfer,
        afterMinutes,
        mode
    ) {

        const firstStop =
            firstTrip.stops[
                transfer.firstIndex
            ];

        const secondStop =
            secondTrip.stops[
                transfer.secondIndex
            ];


        // -----------------------------------------------------
        // Čas příjezdu na přestup
        // -----------------------------------------------------

        const transferArrival =
            firstStop.minutes;


        // -----------------------------------------------------
        // Druhý spoj musí odjet PO příjezdu.
        //
        // Dáváme minimálně 1 minutu na přestup.
        // -----------------------------------------------------

        if (
            secondStop.minutes <
            transferArrival + 1
        ) {
            return null;
        }


        const firstSection =
            getSection(
                firstTrip,
                from,
                transfer.name
            );

        const secondSection =
            getSection(
                secondTrip,
                transfer.name,
                to
            );


        if (
            !firstSection ||
            !secondSection
        ) {
            return null;
        }


        if (
            firstSection.departureMinutes <
            afterMinutes
        ) {
            return null;
        }


        const totalArrival =
            secondSection.arrivalMinutes;


        return {

            isTransfer:
                true,

            transferStop:
                transfer.name,

            departure:
                firstSection.departure,

            arrival:
                secondSection.arrival,

            departureMinutes:
                firstSection.departureMinutes,

            arrivalMinutes:
                totalArrival,

            from,
            to,

            // První linka
            line:
                firstTrip.line,

            directionId:
                firstTrip.directionId,

            destination:
                firstTrip.destination,

            isShortTrip:
                firstTrip.isShortTrip,

            stops:
                firstSection.stops,

            // -------------------------------------------------
            // DRUHÁ ČÁST
            // -------------------------------------------------

            secondLine:
                secondTrip.line,

            secondDirectionId:
                secondTrip.directionId,

            secondDestination:
                secondTrip.destination,

            secondIsShortTrip:
                secondTrip.isShortTrip,

            secondStops:
                secondSection.stops,

            secondDeparture:
                secondSection.departure,

            secondArrival:
                secondSection.arrival,

            secondDepartureMinutes:
                secondSection.departureMinutes,

            secondArrivalMinutes:
                secondSection.arrivalMinutes
        };
    }


    // =========================================================
    // PŘESTUPNÍ SPOJE
    // =========================================================

    function findTransferConnections(
        trips,
        from,
        to,
        afterMinutes,
        mode
    ) {

        const result = [];

        const directCandidates =
            [];


        // =====================================================
        // PRVNÍ SPOJE
        // =====================================================

        for (
            const firstTrip
            of trips
        ) {

            const firstSection =
                getSection(
                    firstTrip,
                    from,
                    firstTrip.stops[
                        firstTrip.stops.length - 1
                    ].name
                );

            if (!firstSection) {
                continue;
            }


            if (
                firstSection.departureMinutes <
                afterMinutes
            ) {
                continue;
            }


            for (
                const secondTrip
                of trips
            ) {

                // Nemá smysl přestupovat na stejný spoj
                if (
                    firstTrip.tripId ===
                    secondTrip.tripId
                ) {
                    continue;
                }


                const transfer =
                    findFirstCommonStop(
                        firstTrip,
                        secondTrip,
                        from,
                        to
                    );


                if (!transfer) {
                    continue;
                }


                const connection =
                    createTransfer(
                        firstTrip,
                        secondTrip,
                        from,
                        to,
                        transfer,
                        afterMinutes,
                        mode
                    );


                if (!connection) {
                    continue;
                }


                directCandidates.push(
                    connection
                );
            }
        }


        // =====================================================
        // ODSTRANĚNÍ DUPLICIT
        // =====================================================

        const unique =
            new Map();

        for (
            const connection
            of directCandidates
        ) {

            const key =
                connection.departureMinutes +
                "|" +
                connection.arrivalMinutes +
                "|" +
                connection.line +
                "|" +
                connection.secondLine +
                "|" +
                connection.transferStop;

            if (!unique.has(key)) {

                unique.set(
                    key,
                    connection
                );
            }
        }


        result.push(
            ...unique.values()
        );


        // =====================================================
        // SEŘAZENÍ
        // =====================================================

        result.sort(
            (a, b) => {

                if (
                    mode === "arrival"
                ) {
                    return (
                        a.arrivalMinutes -
                        b.arrivalMinutes
                    );
                }

                return (
                    a.departureMinutes -
                    b.departureMinutes
                );
            }
        );


        return result;
    }


    // =========================================================
    // HLAVNÍ FUNKCE
    // =========================================================

    async function findConnections(
        from,
        to,
        afterTime = "00:00",
        dayType = "weekdays",
        lineNumbers = []
    ) {

        from =
            String(from).trim();

        to =
            String(to).trim();


        if (!from || !to) {
            return [];
        }


        if (
            from.toLowerCase() ===
            to.toLowerCase()
        ) {
            return [];
        }


        const afterMinutes =
            timeToMinutes(
                afterTime
            );


        // =====================================================
        // NAČTENÍ VŠECH SPOJŮ
        // =====================================================

        const trips =
            await getAllTrips(
                lineNumbers,
                dayType
            );


        if (!trips.length) {
            return [];
        }


        // =====================================================
        // PŘÍMÉ SPOJE
        // =====================================================

        const direct =
            findDirectConnections(
                trips,
                from,
                to,
                afterMinutes,
                "departure"
            );


        // =====================================================
        // POKUD EXISTUJE PŘÍMÝ SPOJ,
        // PŘESTUPY SE BĚŽNĚ NEZOBRAZÍ.
        //
        // Výjimka:
        // přestup musí být RYCHLEJŠÍ.
        // =====================================================

        let fastestDirectArrival =
            Infinity;

        if (direct.length > 0) {

            fastestDirectArrival =
                Math.min(
                    ...direct.map(
                        connection =>
                            connection.arrivalMinutes
                    )
                );
        }


        // =====================================================
        // PŘESTUPY
        // =====================================================

        const transfers =
            findTransferConnections(
                trips,
                from,
                to,
                afterMinutes,
                "departure"
            );


        // =====================================================
        // PŘESTUP POUZE POKUD JE RYCHLEJŠÍ
        // =====================================================

        const usefulTransfers =
            transfers.filter(
                connection => {

                    if (
                        fastestDirectArrival ===
                        Infinity
                    ) {
                        return true;
                    }

                    return (
                        connection.arrivalMinutes <
                        fastestDirectArrival
                    );
                }
            );


        // =====================================================
        // VÝSLEDKY
        // =====================================================

        let results = [];


        // Přímé spoje vždy mají přednost
        results.push(
            ...direct
        );


        // Rychlejší přestupy
        results.push(
            ...usefulTransfers
        );


        // =====================================================
        // FINÁLNÍ ODSTRANĚNÍ DUPLICIT
        // =====================================================

        const unique =
            new Map();

        for (
            const connection
            of results
        ) {

            let key;

            if (
                connection.isTransfer
            ) {

                key =
                    "T|" +
                    connection.departureMinutes +
                    "|" +
                    connection.arrivalMinutes +
                    "|" +
                    connection.line +
                    "|" +
                    connection.secondLine +
                    "|" +
                    connection.transferStop;

            } else {

                key =
                    "D|" +
                    connection.departureMinutes +
                    "|" +
                    connection.arrivalMinutes +
                    "|" +
                    connection.line +
                    "|" +
                    connection.directionId;
            }


            if (!unique.has(key)) {

                unique.set(
                    key,
                    connection
                );
            }
        }


        results =
            [...unique.values()];


        // =====================================================
        // SEŘAZENÍ PODLE ODJEZDU
        // =====================================================

        results.sort(
            (a, b) => {

                if (
                    a.departureMinutes !==
                    b.departureMinutes
                ) {

                    return (
                        a.departureMinutes -
                        b.departureMinutes
                    );
                }


                return (
                    a.arrivalMinutes -
                    b.arrivalMinutes
                );
            }
        );


        // =====================================================
        // NEVRACEJ STEJNÝ SPOJ VÍCEKRÁT
        //
        // Například:
        // linka 2 06:44
        //
        // se zobrazí jen jednou.
        // =====================================================

        const finalResults = [];

        const seenTrips =
            new Set();

        for (
            const connection
            of results
        ) {

            if (
                !connection.isTransfer
            ) {

                const key =
                    connection.line +
                    "|" +
                    connection.directionId +
                    "|" +
                    connection.departureMinutes +
                    "|" +
                    connection.arrivalMinutes;

                if (
                    seenTrips.has(key)
                ) {
                    continue;
                }

                seenTrips.add(key);
            }


            finalResults.push(
                connection
            );
        }


        return finalResults;
    }


    // =========================================================
    // EXPORT
    // =========================================================

    return {

        loadTimetable,

        findConnections

    };

})();
