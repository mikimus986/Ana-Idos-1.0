// app.js

document.addEventListener("DOMContentLoaded", () => {

    const fromInput = document.getElementById("from");
    const toInput = document.getElementById("to");
    const timeInput = document.getElementById("time");
    const searchButton = document.getElementById("searchButton");
    const resultsContainer = document.getElementById("results");

    if (!fromInput || !toInput || !searchButton || !resultsContainer) {
        console.error("Chybí některý HTML prvek:");
        console.error({
            from: !!fromInput,
            to: !!toInput,
            searchButton: !!searchButton,
            results: !!resultsContainer
        });
        return;
    }


    // Všechny linky
    const lines = [
        "1", "2", "3", "4", "8", "9",
        "13", "14", "19", "21", "22", "23",
        "40", "44", "51", "52", "53", "54",
        "55", "56", "63", "74", "76", "77",
        "112", "113",

        "25", "26", "27", "30", "31", "32",
        "33", "34", "35", "37", "38",

        "5", "6", "7", "10", "11", "12",
        "15", "17",

        "S1", "S2"
    ];


    // Zjistí, jestli je víkend
    function getDayType() {

        const day = new Date().getDay();

        // 0 = neděle
        // 6 = sobota

        if (day === 0 || day === 6) {
            return "weekends";
        }

        return "weekdays";
    }


    // Vytvoří HTML jednoho spoje
    function createResult(connection) {

        const result = document.createElement("div");

        result.className = "connection";


        const shortTrip =
            connection.isShortTrip
                ? "S"
                : "";


        result.innerHTML = `
            <div class="connection-line">
                Linka ${connection.line}${shortTrip}
            </div>

            <div class="connection-route">
                ${connection.from}
                →
                ${connection.to}
            </div>

            <div class="connection-times">
                <strong>${connection.departure}</strong>
                →
                <strong>${connection.arrival}</strong>
            </div>

            <div class="connection-destination">
                Směr: ${connection.destination}
            </div>
        `;


        // Po kliknutí zobrazí všechny zastávky
        result.addEventListener("click", () => {

            const stops = connection.stops
                .map(stop => {
                    return `${stop.name} — ${stop.time}`;
                })
                .join("<br>");

            result.innerHTML += `
                <div class="connection-stops">
                    ${stops}
                </div>
            `;
        });


        return result;
    }


    // Kliknutí na VYHLEDAT
    searchButton.addEventListener("click", async (event) => {

        event.preventDefault();


        const from = fromInput.value.trim();
        const to = toInput.value.trim();

        const afterTime =
            timeInput && timeInput.value
                ? timeInput.value
                : "00:00";


        // Kontrola vstupu
        if (!from || !to) {

            resultsContainer.innerHTML = `
                <div class="error">
                    Vyber výchozí a cílovou zastávku.
                </div>
            `;

            return;
        }


        resultsContainer.innerHTML = `
            <div class="loading">
                Vyhledávám spoje…
            </div>
        `;


        try {

            // Kontrola search.js
            if (
                !window.searchTimetable ||
                !window.searchTimetable.findConnections
            ) {

                throw new Error(
                    "search.js není načtený nebo neobsahuje findConnections()."
                );
            }


            const dayType =
                getDayType();


            console.log("Vyhledávání:", {
                from,
                to,
                afterTime,
                dayType,
                lines
            });


            const connections =
                await window.searchTimetable.findConnections(
                    from,
                    to,
                    afterTime,
                    dayType,
                    lines
                );


            resultsContainer.innerHTML = "";


            if (!connections || connections.length === 0) {

                resultsContainer.innerHTML = `
                    <div class="no-results">
                        Žádný přímý spoj nebyl nalezen.
                    </div>
                `;

                return;
            }


            for (const connection of connections) {

                resultsContainer.appendChild(
                    createResult(connection)
                );
            }


        } catch (error) {

            console.error(
                "CHYBA VYHLEDÁVÁNÍ:",
                error
            );


            resultsContainer.innerHTML = `
                <div class="error">
                    <strong>Chyba při vyhledávání.</strong>
                    <br>
                    ${error.message}
                </div>
            `;
        }
    });

});
