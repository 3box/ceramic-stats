/*
 Launch and sleep - useful for debugging on the container
 */
async function main() {
    await new Promise(resolve => setTimeout(resolve, 3600000))
}

main()
    .then(function () { })

export {}
