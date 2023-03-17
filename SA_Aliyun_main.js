/**
 * @name 阿里云盘签到
 * @author Alrcly Suzuki
 * @version 0.1
 */

const updateAccesssTokenURL = "https://auth.aliyundrive.com/v2/account/token"
const signinURL = "https://member.aliyundrive.com/v1/activity/sign_in_list"
const refreshToeknArry = process.env.aliyunID

const fetch = require("node-fetch")

!(async () => {
    for (const elem of refreshToeknArry) {
        // 
        const queryBody = {
            'grant_type': 'refresh_token',
            'refresh_token': elem
        };
        //使用 refresh_token 更新 access_token
        fetch(updateAccesssTokenURL, {
            method: "POST",
            body: JSON.stringify(queryBody),
            headers: { 'Content-Type': 'application/json' }
        }).then((res) => {
            return res.json()
        }).then((json) => {
            let access_token = json.access_token;
            //签到
            fetch(signinURL, {
                method: "POST",
                body: JSON.stringify(queryBody),
                headers: { 'Authorization': 'Bearer ' + access_token, 'Content-Type': 'application/json' }
            }).then((res) => {
                return res.json()
            }).then((json) => {
                console.log(json);
            }).catch((err) => {
                console.log(err)
            })
        }).catch((err) => {
            console.log(err)
        })
    }
})().catch((e) => {
    console.error(`❗️  运行错误！\n${e}`)
}).finally()

